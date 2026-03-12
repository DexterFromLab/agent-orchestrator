// Sidecar lifecycle management (Deno-first, Node.js fallback)
// Spawns bundled agent-runner.mjs via deno or node, communicates via stdio NDJSON

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::event::EventSink;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentQueryOptions {
    #[serde(default = "default_provider")]
    pub provider: String,
    pub session_id: String,
    pub prompt: String,
    pub cwd: Option<String>,
    pub max_turns: Option<u32>,
    pub max_budget_usd: Option<f64>,
    pub resume_session_id: Option<String>,
    pub permission_mode: Option<String>,
    pub setting_sources: Option<Vec<String>>,
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    pub claude_config_dir: Option<String>,
    pub additional_directories: Option<Vec<String>>,
    /// When set, agent runs in a git worktree for isolation (passed as --worktree <name> CLI flag)
    pub worktree_name: Option<String>,
    /// Provider-specific configuration blob (passed through to sidecar as-is)
    #[serde(default)]
    pub provider_config: serde_json::Value,
    /// Extra environment variables injected into the agent process (e.g. BTMSG_AGENT_ID)
    #[serde(default)]
    pub extra_env: std::collections::HashMap<String, String>,
}

fn default_provider() -> String {
    "claude".to_string()
}

/// Directories to search for sidecar scripts.
#[derive(Debug, Clone)]
pub struct SidecarConfig {
    pub search_paths: Vec<PathBuf>,
    /// Extra env vars forwarded to sidecar processes (e.g. BTERMINAL_TEST=1 for test isolation)
    pub env_overrides: std::collections::HashMap<String, String>,
}

struct SidecarCommand {
    program: String,
    args: Vec<String>,
}

pub struct SidecarManager {
    child: Arc<Mutex<Option<Child>>>,
    stdin_writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    ready: Arc<Mutex<bool>>,
    sink: Arc<dyn EventSink>,
    config: SidecarConfig,
}

impl SidecarManager {
    pub fn new(sink: Arc<dyn EventSink>, config: SidecarConfig) -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin_writer: Arc::new(Mutex::new(None)),
            ready: Arc::new(Mutex::new(false)),
            sink,
            config,
        }
    }

    pub fn start(&self) -> Result<(), String> {
        let mut child_lock = self.child.lock().unwrap();
        if child_lock.is_some() {
            return Err("Sidecar already running".to_string());
        }

        let cmd = self.resolve_sidecar_command()?;

        log::info!("Starting sidecar: {} {}", cmd.program, cmd.args.join(" "));

        // Build a clean environment stripping provider-specific vars to prevent
        // SDKs from detecting nesting when BTerminal is launched from a provider terminal.
        // Per-provider prefixes: CLAUDE* (whitelist CLAUDE_CODE_EXPERIMENTAL_*),
        // CODEX* and OLLAMA* for future providers.
        let clean_env: Vec<(String, String)> = std::env::vars()
            .filter(|(k, _)| {
                strip_provider_env_var(k)
            })
            .collect();

        let mut child = Command::new(&cmd.program)
            .args(&cmd.args)
            .env_clear()
            .envs(clean_env)
            .envs(self.config.env_overrides.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start sidecar: {e}"))?;

        let child_stdin = child
            .stdin
            .take()
            .ok_or("Failed to capture sidecar stdin")?;
        let child_stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture sidecar stdout")?;
        let child_stderr = child
            .stderr
            .take()
            .ok_or("Failed to capture sidecar stderr")?;

        *self.stdin_writer.lock().unwrap() = Some(Box::new(child_stdin));

        // Stdout reader thread — forwards NDJSON to event sink
        let sink = self.sink.clone();
        let ready = self.ready.clone();
        thread::spawn(move || {
            let reader = BufReader::new(child_stdout);
            for line in reader.lines() {
                match line {
                    Ok(line) => {
                        if line.trim().is_empty() {
                            continue;
                        }
                        match serde_json::from_str::<serde_json::Value>(&line) {
                            Ok(msg) => {
                                if msg.get("type").and_then(|t| t.as_str()) == Some("ready") {
                                    *ready.lock().unwrap() = true;
                                    log::info!("Sidecar ready");
                                }
                                sink.emit("sidecar-message", msg);
                            }
                            Err(e) => {
                                log::warn!("Invalid JSON from sidecar: {e}: {line}");
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Sidecar stdout read error: {e}");
                        break;
                    }
                }
            }
            log::info!("Sidecar stdout reader exited");
            sink.emit("sidecar-exited", serde_json::Value::Null);
        });

        // Stderr reader thread — logs only
        thread::spawn(move || {
            let reader = BufReader::new(child_stderr);
            for line in reader.lines() {
                match line {
                    Ok(line) => log::info!("[sidecar stderr] {line}"),
                    Err(e) => {
                        log::error!("Sidecar stderr read error: {e}");
                        break;
                    }
                }
            }
        });

        *child_lock = Some(child);
        Ok(())
    }

    pub fn send_message(&self, msg: &serde_json::Value) -> Result<(), String> {
        let mut writer_lock = self.stdin_writer.lock().unwrap();
        let writer = writer_lock.as_mut().ok_or("Sidecar not running")?;

        let line =
            serde_json::to_string(msg).map_err(|e| format!("JSON serialize error: {e}"))?;

        writer
            .write_all(line.as_bytes())
            .map_err(|e| format!("Sidecar write error: {e}"))?;
        writer
            .write_all(b"\n")
            .map_err(|e| format!("Sidecar write error: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("Sidecar flush error: {e}"))?;

        Ok(())
    }

    pub fn query(&self, options: &AgentQueryOptions) -> Result<(), String> {
        if !*self.ready.lock().unwrap() {
            return Err("Sidecar not ready".to_string());
        }

        // Validate that the requested provider has a runner available
        let runner_name = format!("{}-runner.mjs", options.provider);
        let runner_exists = self
            .config
            .search_paths
            .iter()
            .any(|base| base.join("dist").join(&runner_name).exists());
        if !runner_exists {
            return Err(format!(
                "No sidecar runner found for provider '{}' (expected {})",
                options.provider, runner_name
            ));
        }

        let msg = serde_json::json!({
            "type": "query",
            "provider": options.provider,
            "sessionId": options.session_id,
            "prompt": options.prompt,
            "cwd": options.cwd,
            "maxTurns": options.max_turns,
            "maxBudgetUsd": options.max_budget_usd,
            "resumeSessionId": options.resume_session_id,
            "permissionMode": options.permission_mode,
            "settingSources": options.setting_sources,
            "systemPrompt": options.system_prompt,
            "model": options.model,
            "claudeConfigDir": options.claude_config_dir,
            "additionalDirectories": options.additional_directories,
            "worktreeName": options.worktree_name,
            "providerConfig": options.provider_config,
            "extraEnv": options.extra_env,
        });

        self.send_message(&msg)
    }

    pub fn stop_session(&self, session_id: &str) -> Result<(), String> {
        let msg = serde_json::json!({
            "type": "stop",
            "sessionId": session_id,
        });
        self.send_message(&msg)
    }

    pub fn restart(&self) -> Result<(), String> {
        log::info!("Restarting sidecar");
        let _ = self.shutdown();
        self.start()
    }

    pub fn shutdown(&self) -> Result<(), String> {
        let mut child_lock = self.child.lock().unwrap();
        if let Some(ref mut child) = *child_lock {
            log::info!("Shutting down sidecar");
            *self.stdin_writer.lock().unwrap() = None;
            let _ = child.kill();
            let _ = child.wait();
        }
        *child_lock = None;
        *self.ready.lock().unwrap() = false;
        Ok(())
    }

    pub fn is_ready(&self) -> bool {
        *self.ready.lock().unwrap()
    }

    /// Resolve a sidecar runner command. Uses the default claude-runner for startup.
    /// Future providers will have their own runners (e.g. codex-runner.mjs).
    fn resolve_sidecar_command(&self) -> Result<SidecarCommand, String> {
        self.resolve_sidecar_for_provider("claude")
    }

    /// Resolve a sidecar command for a specific provider's runner file.
    fn resolve_sidecar_for_provider(&self, provider: &str) -> Result<SidecarCommand, String> {
        let runner_name = format!("{}-runner.mjs", provider);

        // Try Deno first (faster startup, better perf), fall back to Node.js.
        let has_deno = Command::new("deno")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok();
        let has_node = Command::new("node")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok();

        let mut checked = Vec::new();

        for base in &self.config.search_paths {
            let mjs_path = base.join("dist").join(&runner_name);
            if mjs_path.exists() {
                if has_deno {
                    return Ok(SidecarCommand {
                        program: "deno".to_string(),
                        args: vec![
                            "run".to_string(),
                            "--allow-run".to_string(),
                            "--allow-env".to_string(),
                            "--allow-read".to_string(),
                            "--allow-write".to_string(),
                            "--allow-net".to_string(),
                            mjs_path.to_string_lossy().to_string(),
                        ],
                    });
                }
                if has_node {
                    return Ok(SidecarCommand {
                        program: "node".to_string(),
                        args: vec![mjs_path.to_string_lossy().to_string()],
                    });
                }
            }
            checked.push(mjs_path);
        }

        let paths: Vec<_> = checked.iter().map(|p| p.display().to_string()).collect();
        let runtime_note = if !has_deno && !has_node {
            ". Neither deno nor node found in PATH"
        } else {
            ""
        };
        Err(format!(
            "Sidecar not found for provider '{}'. Checked: {}{}",
            provider,
            paths.join(", "),
            runtime_note,
        ))
    }
}

/// Returns true if the env var should be KEPT (not stripped).
/// First line of defense: strips provider-specific prefixes to prevent nesting detection
/// and credential leakage. JS runners apply a second layer of provider-specific stripping.
///
/// Stripped prefixes: CLAUDE*, CODEX*, OLLAMA*, ANTHROPIC_*
/// Whitelisted: CLAUDE_CODE_EXPERIMENTAL_* (feature flags like agent teams)
///
/// Note: OPENAI_* is NOT stripped here because the Codex runner needs OPENAI_API_KEY
/// from the environment (it re-injects it after its own stripping). If Codex support
/// moves to extraEnv-based key injection, add OPENAI to this list.
fn strip_provider_env_var(key: &str) -> bool {
    if key.starts_with("CLAUDE_CODE_EXPERIMENTAL_") {
        return true;
    }
    if key.starts_with("CLAUDE")
        || key.starts_with("CODEX")
        || key.starts_with("OLLAMA")
        || key.starts_with("ANTHROPIC_")
    {
        return false;
    }
    true
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- strip_provider_env_var unit tests ----

    #[test]
    fn test_keeps_normal_env_vars() {
        assert!(strip_provider_env_var("HOME"));
        assert!(strip_provider_env_var("PATH"));
        assert!(strip_provider_env_var("USER"));
        assert!(strip_provider_env_var("SHELL"));
        assert!(strip_provider_env_var("TERM"));
        assert!(strip_provider_env_var("XDG_DATA_HOME"));
        assert!(strip_provider_env_var("RUST_LOG"));
    }

    #[test]
    fn test_strips_claude_vars() {
        assert!(!strip_provider_env_var("CLAUDE_CONFIG_DIR"));
        assert!(!strip_provider_env_var("CLAUDE_SESSION_ID"));
        assert!(!strip_provider_env_var("CLAUDECODE"));
        assert!(!strip_provider_env_var("CLAUDE_API_KEY"));
    }

    #[test]
    fn test_whitelists_claude_code_experimental() {
        assert!(strip_provider_env_var("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"));
        assert!(strip_provider_env_var("CLAUDE_CODE_EXPERIMENTAL_TOOLS"));
        assert!(strip_provider_env_var("CLAUDE_CODE_EXPERIMENTAL_SOMETHING_NEW"));
    }

    #[test]
    fn test_strips_codex_vars() {
        assert!(!strip_provider_env_var("CODEX_API_KEY"));
        assert!(!strip_provider_env_var("CODEX_SESSION"));
        assert!(!strip_provider_env_var("CODEX_CONFIG"));
    }

    #[test]
    fn test_strips_ollama_vars() {
        assert!(!strip_provider_env_var("OLLAMA_HOST"));
        assert!(!strip_provider_env_var("OLLAMA_MODELS"));
        assert!(!strip_provider_env_var("OLLAMA_NUM_PARALLEL"));
    }

    #[test]
    fn test_strips_anthropic_vars() {
        // ANTHROPIC_* vars stripped at Rust layer (defense in depth)
        // Claude CLI has its own auth via credentials file
        assert!(!strip_provider_env_var("ANTHROPIC_API_KEY"));
        assert!(!strip_provider_env_var("ANTHROPIC_BASE_URL"));
        assert!(!strip_provider_env_var("ANTHROPIC_LOG"));
    }

    #[test]
    fn test_keeps_openai_vars() {
        // OPENAI_* vars are NOT stripped by the Rust layer
        // (they're stripped in the JS codex-runner layer instead)
        assert!(strip_provider_env_var("OPENAI_API_KEY"));
        assert!(strip_provider_env_var("OPENAI_BASE_URL"));
    }

    #[test]
    fn test_env_filtering_integration() {
        let test_env = vec![
            ("HOME", "/home/user"),
            ("PATH", "/usr/bin"),
            ("CLAUDE_CONFIG_DIR", "/tmp/claude"),
            ("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", "1"),
            ("CODEX_API_KEY", "sk-test"),
            ("OLLAMA_HOST", "localhost"),
            ("ANTHROPIC_API_KEY", "sk-ant-xxx"),
            ("OPENAI_API_KEY", "sk-openai-xxx"),
            ("RUST_LOG", "debug"),
            ("BTMSG_AGENT_ID", "a1"),
        ];

        let kept: Vec<&str> = test_env
            .iter()
            .filter(|(k, _)| strip_provider_env_var(k))
            .map(|(k, _)| *k)
            .collect();

        assert!(kept.contains(&"HOME"));
        assert!(kept.contains(&"PATH"));
        assert!(kept.contains(&"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"));
        assert!(kept.contains(&"RUST_LOG"));
        assert!(kept.contains(&"BTMSG_AGENT_ID"));
        // OPENAI_* passes through Rust layer (Codex runner needs it)
        assert!(kept.contains(&"OPENAI_API_KEY"));
        // These are stripped:
        assert!(!kept.contains(&"CLAUDE_CONFIG_DIR"));
        assert!(!kept.contains(&"CODEX_API_KEY"));
        assert!(!kept.contains(&"OLLAMA_HOST"));
        assert!(!kept.contains(&"ANTHROPIC_API_KEY"));
    }
}
