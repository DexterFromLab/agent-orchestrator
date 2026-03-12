// Sidecar lifecycle management (Deno-first, Node.js fallback)
// Spawns per-provider runner scripts (e.g. claude-runner.mjs, aider-runner.mjs)
// via deno or node, communicates via stdio NDJSON.
// Each provider gets its own process, started lazily on first query.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::event::EventSink;
use crate::sandbox::SandboxConfig;

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
    /// Landlock filesystem sandbox configuration (Linux 5.13+, applied via pre_exec)
    pub sandbox: SandboxConfig,
}

struct SidecarCommand {
    program: String,
    args: Vec<String>,
}

/// Per-provider sidecar process state.
struct ProviderProcess {
    child: Child,
    stdin_writer: Box<dyn Write + Send>,
    ready: bool,
}

pub struct SidecarManager {
    /// Provider name → running sidecar process
    providers: Arc<Mutex<HashMap<String, ProviderProcess>>>,
    /// Session ID → provider name (for routing stop messages)
    session_providers: Arc<Mutex<HashMap<String, String>>>,
    sink: Arc<dyn EventSink>,
    config: Mutex<SidecarConfig>,
}

impl SidecarManager {
    pub fn new(sink: Arc<dyn EventSink>, config: SidecarConfig) -> Self {
        Self {
            providers: Arc::new(Mutex::new(HashMap::new())),
            session_providers: Arc::new(Mutex::new(HashMap::new())),
            sink,
            config: Mutex::new(config),
        }
    }

    /// Update the sandbox configuration. Takes effect on next sidecar (re)start.
    pub fn set_sandbox(&self, sandbox: SandboxConfig) {
        self.config.lock().unwrap().sandbox = sandbox;
    }

    /// Start the default (claude) provider sidecar. Called on app startup.
    pub fn start(&self) -> Result<(), String> {
        self.start_provider("claude")
    }

    /// Start a specific provider's sidecar process.
    fn start_provider(&self, provider: &str) -> Result<(), String> {
        let mut providers = self.providers.lock().unwrap();
        if providers.contains_key(provider) {
            return Err(format!("Sidecar for '{}' already running", provider));
        }

        let config = self.config.lock().unwrap();
        let cmd = Self::resolve_sidecar_for_provider_with_config(&config, provider)?;

        log::info!("Starting {} sidecar: {} {}", provider, cmd.program, cmd.args.join(" "));

        // Build a clean environment stripping provider-specific vars to prevent
        // SDKs from detecting nesting when BTerminal is launched from a provider terminal.
        let clean_env: Vec<(String, String)> = std::env::vars()
            .filter(|(k, _)| {
                strip_provider_env_var(k)
            })
            .collect();

        let mut command = Command::new(&cmd.program);
        command
            .args(&cmd.args)
            .env_clear()
            .envs(clean_env)
            .envs(config.env_overrides.iter().map(|(k, v)| (k.as_str(), v.as_str())))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Apply Landlock sandbox in child process before exec (Linux only).
        #[cfg(unix)]
        if config.sandbox.enabled {
            let sandbox = config.sandbox.clone();
            unsafe {
                command.pre_exec(move || {
                    sandbox.apply().map(|enforced| {
                        if !enforced {
                            log::warn!("Landlock sandbox not enforced in sidecar child");
                        }
                    }).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
                });
            }
        }

        // Drop config lock before spawn
        drop(config);

        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to start {} sidecar: {e}", provider))?;

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

        // Stdout reader thread — forwards NDJSON to event sink
        let sink = self.sink.clone();
        let providers_ref = self.providers.clone();
        let provider_name = provider.to_string();
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
                                    if let Ok(mut provs) = providers_ref.lock() {
                                        if let Some(p) = provs.get_mut(&provider_name) {
                                            p.ready = true;
                                        }
                                    }
                                    log::info!("{} sidecar ready", provider_name);
                                }
                                sink.emit("sidecar-message", msg);
                            }
                            Err(e) => {
                                log::warn!("Invalid JSON from {} sidecar: {e}: {line}", provider_name);
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("{} sidecar stdout read error: {e}", provider_name);
                        break;
                    }
                }
            }
            log::info!("{} sidecar stdout reader exited", provider_name);
            sink.emit("sidecar-exited", serde_json::json!({ "provider": provider_name }));
        });

        // Stderr reader thread — logs only
        let provider_name2 = provider.to_string();
        thread::spawn(move || {
            let reader = BufReader::new(child_stderr);
            for line in reader.lines() {
                match line {
                    Ok(line) => log::info!("[{} sidecar stderr] {line}", provider_name2),
                    Err(e) => {
                        log::error!("{} sidecar stderr read error: {e}", provider_name2);
                        break;
                    }
                }
            }
        });

        providers.insert(provider.to_string(), ProviderProcess {
            child,
            stdin_writer: Box::new(child_stdin),
            ready: false,
        });

        Ok(())
    }

    /// Ensure a provider's sidecar is running and ready, starting it lazily if needed.
    fn ensure_provider(&self, provider: &str) -> Result<(), String> {
        {
            let providers = self.providers.lock().unwrap();
            if let Some(p) = providers.get(provider) {
                if p.ready {
                    return Ok(());
                }
                // Started but not ready yet — wait briefly
            } else {
                drop(providers);
                self.start_provider(provider)?;
            }
        }

        // Wait for ready (up to 10 seconds)
        for _ in 0..100 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            let providers = self.providers.lock().unwrap();
            if let Some(p) = providers.get(provider) {
                if p.ready {
                    return Ok(());
                }
            } else {
                return Err(format!("{} sidecar process exited before ready", provider));
            }
        }
        Err(format!("{} sidecar did not become ready within timeout", provider))
    }

    fn send_to_provider(&self, provider: &str, msg: &serde_json::Value) -> Result<(), String> {
        let mut providers = self.providers.lock().unwrap();
        let proc = providers.get_mut(provider)
            .ok_or_else(|| format!("{} sidecar not running", provider))?;

        let line = serde_json::to_string(msg)
            .map_err(|e| format!("JSON serialize error: {e}"))?;

        proc.stdin_writer
            .write_all(line.as_bytes())
            .map_err(|e| format!("Sidecar write error: {e}"))?;
        proc.stdin_writer
            .write_all(b"\n")
            .map_err(|e| format!("Sidecar write error: {e}"))?;
        proc.stdin_writer
            .flush()
            .map_err(|e| format!("Sidecar flush error: {e}"))?;

        Ok(())
    }

    /// Legacy send_message — routes to the default (claude) provider.
    pub fn send_message(&self, msg: &serde_json::Value) -> Result<(), String> {
        self.send_to_provider("claude", msg)
    }

    pub fn query(&self, options: &AgentQueryOptions) -> Result<(), String> {
        let provider = &options.provider;

        // Ensure the provider's sidecar is running and ready
        self.ensure_provider(provider)?;

        // Track session → provider mapping for stop routing
        self.session_providers.lock().unwrap()
            .insert(options.session_id.clone(), provider.clone());

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

        self.send_to_provider(provider, &msg)
    }

    pub fn stop_session(&self, session_id: &str) -> Result<(), String> {
        let msg = serde_json::json!({
            "type": "stop",
            "sessionId": session_id,
        });

        // Route to the correct provider based on session tracking
        let provider = self.session_providers.lock().unwrap()
            .get(session_id)
            .cloned()
            .unwrap_or_else(|| "claude".to_string());

        self.send_to_provider(&provider, &msg)
    }

    pub fn restart(&self) -> Result<(), String> {
        log::info!("Restarting all sidecars");
        let _ = self.shutdown();
        self.start()
    }

    pub fn shutdown(&self) -> Result<(), String> {
        let mut providers = self.providers.lock().unwrap();
        for (name, mut proc) in providers.drain() {
            log::info!("Shutting down {} sidecar", name);
            let _ = proc.child.kill();
            let _ = proc.child.wait();
        }
        self.session_providers.lock().unwrap().clear();
        Ok(())
    }

    /// Returns true if the default (claude) provider sidecar is ready.
    pub fn is_ready(&self) -> bool {
        let providers = self.providers.lock().unwrap();
        providers.get("claude")
            .map(|p| p.ready)
            .unwrap_or(false)
    }

    /// Resolve a sidecar command for a specific provider's runner file.
    fn resolve_sidecar_for_provider_with_config(config: &SidecarConfig, provider: &str) -> Result<SidecarCommand, String> {
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

        for base in &config.search_paths {
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
/// Stripped prefixes: CLAUDE*, CODEX*, OLLAMA*, AIDER*, ANTHROPIC_*
/// Whitelisted: CLAUDE_CODE_EXPERIMENTAL_* (feature flags like agent teams)
///
/// Note: OPENAI_* and OPENROUTER_* are NOT stripped here because runners need
/// these keys from the environment or extraEnv injection.
fn strip_provider_env_var(key: &str) -> bool {
    if key.starts_with("CLAUDE_CODE_EXPERIMENTAL_") {
        return true;
    }
    if key.starts_with("CLAUDE")
        || key.starts_with("CODEX")
        || key.starts_with("OLLAMA")
        || key.starts_with("AIDER")
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
