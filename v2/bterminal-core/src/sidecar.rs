// Sidecar lifecycle management (Deno-first, Node.js fallback)
// Spawns per-provider runner scripts (e.g. claude-runner.mjs, aider-runner.mjs)
// via deno or node, communicates via stdio NDJSON.
// Each provider gets its own process, started lazily on first query.
//
// Uses a std::sync::mpsc actor pattern: the actor thread owns all mutable state
// (providers HashMap, session_providers HashMap) exclusively. External callers
// send requests via a channel, eliminating the TOCTOU race in ensure_provider().

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc as std_mpsc;
use std::sync::Arc;
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
    /// Atomic flag set by the stdout reader thread when "ready" message arrives.
    /// The actor polls this to detect readiness without needing a separate channel.
    ready_flag: Arc<std::sync::atomic::AtomicBool>,
}

/// Requests sent from public API methods to the actor thread.
enum ProviderRequest {
    Start {
        reply: std_mpsc::Sender<Result<(), String>>,
    },
    EnsureAndQuery {
        options: AgentQueryOptions,
        reply: std_mpsc::Sender<Result<(), String>>,
    },
    StopSession {
        session_id: String,
        reply: std_mpsc::Sender<Result<(), String>>,
    },
    SendMessage {
        msg: serde_json::Value,
        reply: std_mpsc::Sender<Result<(), String>>,
    },
    Restart {
        reply: std_mpsc::Sender<Result<(), String>>,
    },
    Shutdown {
        reply: std_mpsc::Sender<Result<(), String>>,
    },
    IsReady {
        reply: std_mpsc::Sender<bool>,
    },
    SetSandbox {
        sandbox: SandboxConfig,
        reply: std_mpsc::Sender<()>,
    },
}

pub struct SidecarManager {
    tx: std_mpsc::Sender<ProviderRequest>,
    // Keep a handle so the thread lives as long as the manager.
    // Not joined on drop — we send Shutdown instead.
    _actor_thread: Option<thread::JoinHandle<()>>,
}

/// Actor function that owns all mutable state exclusively.
/// Receives requests via `req_rx`. Ready signaling from stdout reader threads
/// uses per-provider AtomicBool flags (polled during ensure_provider_impl).
fn run_actor(
    req_rx: std_mpsc::Receiver<ProviderRequest>,
    sink: Arc<dyn EventSink>,
    initial_config: SidecarConfig,
) {
    let mut providers: HashMap<String, ProviderProcess> = HashMap::new();
    let mut session_providers: HashMap<String, String> = HashMap::new();
    let mut config = initial_config;

    loop {
        // Block waiting for next request (with timeout so actor stays responsive)
        match req_rx.recv_timeout(std::time::Duration::from_millis(50)) {
            Ok(req) => {
                match req {
                    ProviderRequest::Start { reply } => {
                        let result = start_provider_impl(
                            &mut providers,
                            &config,
                            &sink,
                            "claude",
                        );
                        let _ = reply.send(result);
                    }
                    ProviderRequest::EnsureAndQuery { options, reply } => {
                        let provider = options.provider.clone();

                        // Ensure provider is ready — atomic, no TOCTOU
                        if let Err(e) = ensure_provider_impl(
                            &mut providers,
                            &config,
                            &sink,
                            &provider,
                        ) {
                            let _ = reply.send(Err(e));
                            continue;
                        }

                        // Track session -> provider mapping
                        session_providers.insert(options.session_id.clone(), provider.clone());

                        // Build and send query message
                        let msg = build_query_msg(&options);
                        let result = send_to_provider_impl(&mut providers, &provider, &msg);
                        let _ = reply.send(result);
                    }
                    ProviderRequest::StopSession { session_id, reply } => {
                        let provider = session_providers
                            .get(&session_id)
                            .cloned()
                            .unwrap_or_else(|| "claude".to_string());
                        let msg = serde_json::json!({
                            "type": "stop",
                            "sessionId": session_id,
                        });
                        let result = send_to_provider_impl(&mut providers, &provider, &msg);
                        let _ = reply.send(result);
                    }
                    ProviderRequest::SendMessage { msg, reply } => {
                        let result = send_to_provider_impl(&mut providers, "claude", &msg);
                        let _ = reply.send(result);
                    }
                    ProviderRequest::Restart { reply } => {
                        log::info!("Restarting all sidecars");
                        shutdown_all(&mut providers, &mut session_providers);
                        let result = start_provider_impl(
                            &mut providers,
                            &config,
                            &sink,
                            "claude",
                        );
                        let _ = reply.send(result);
                    }
                    ProviderRequest::Shutdown { reply } => {
                        shutdown_all(&mut providers, &mut session_providers);
                        let _ = reply.send(Ok(()));
                    }
                    ProviderRequest::IsReady { reply } => {
                        // Sync ready state from atomic flags
                        sync_ready_flags(&mut providers);
                        let ready = providers
                            .get("claude")
                            .map(|p| p.ready)
                            .unwrap_or(false);
                        let _ = reply.send(ready);
                    }
                    ProviderRequest::SetSandbox { sandbox, reply } => {
                        config.sandbox = sandbox;
                        let _ = reply.send(());
                    }
                }
            }
            Err(std_mpsc::RecvTimeoutError::Timeout) => {
                // Loop back -- keeps actor responsive to shutdown
                continue;
            }
            Err(std_mpsc::RecvTimeoutError::Disconnected) => {
                // All senders dropped — shut down
                break;
            }
        }
    }

    // Channel closed — clean up remaining providers
    shutdown_all(&mut providers, &mut session_providers);
}

/// Sync ready state from AtomicBool flags set by stdout reader threads.
fn sync_ready_flags(providers: &mut HashMap<String, ProviderProcess>) {
    for p in providers.values_mut() {
        if !p.ready && p.ready_flag.load(std::sync::atomic::Ordering::Acquire) {
            p.ready = true;
        }
    }
}

/// Shut down all provider processes and clear session mappings.
fn shutdown_all(
    providers: &mut HashMap<String, ProviderProcess>,
    session_providers: &mut HashMap<String, String>,
) {
    for (name, mut proc) in providers.drain() {
        log::info!("Shutting down {} sidecar", name);
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
    session_providers.clear();
}

/// Start a specific provider's sidecar process. Called from the actor thread
/// which owns the providers HashMap exclusively — no lock contention possible.
fn start_provider_impl(
    providers: &mut HashMap<String, ProviderProcess>,
    config: &SidecarConfig,
    sink: &Arc<dyn EventSink>,
    provider: &str,
) -> Result<(), String> {
    if providers.contains_key(provider) {
        return Err(format!("Sidecar for '{}' already running", provider));
    }

    let cmd = SidecarManager::resolve_sidecar_for_provider_with_config(config, provider)?;

    log::info!(
        "Starting {} sidecar: {} {}",
        provider,
        cmd.program,
        cmd.args.join(" ")
    );

    // Build a clean environment stripping provider-specific vars to prevent
    // SDKs from detecting nesting when BTerminal is launched from a provider terminal.
    let clean_env: Vec<(String, String)> = std::env::vars()
        .filter(|(k, _)| strip_provider_env_var(k))
        .collect();

    let mut command = Command::new(&cmd.program);
    command
        .args(&cmd.args)
        .env_clear()
        .envs(clean_env)
        .envs(
            config
                .env_overrides
                .iter()
                .map(|(k, v)| (k.as_str(), v.as_str())),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Apply Landlock sandbox in child process before exec (Linux only).
    #[cfg(unix)]
    if config.sandbox.enabled {
        let sandbox = config.sandbox.clone();
        unsafe {
            command.pre_exec(move || {
                sandbox
                    .apply()
                    .map(|enforced| {
                        if !enforced {
                            log::warn!("Landlock sandbox not enforced in sidecar child");
                        }
                    })
                    .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))
            });
        }
    }

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

    // Per-provider AtomicBool for ready signaling from stdout reader thread to actor.
    let ready_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let ready_flag_writer = ready_flag.clone();

    // Stdout reader thread — forwards NDJSON to event sink
    let sink_clone = sink.clone();
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
                                ready_flag_writer
                                    .store(true, std::sync::atomic::Ordering::Release);
                                log::info!("{} sidecar ready", provider_name);
                            }
                            sink_clone.emit("sidecar-message", msg);
                        }
                        Err(e) => {
                            log::warn!(
                                "Invalid JSON from {} sidecar: {e}: {line}",
                                provider_name
                            );
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
        sink_clone.emit(
            "sidecar-exited",
            serde_json::json!({ "provider": provider_name }),
        );
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

    providers.insert(
        provider.to_string(),
        ProviderProcess {
            child,
            stdin_writer: Box::new(child_stdin),
            ready: false,
            ready_flag,
        },
    );

    Ok(())
}

/// Ensure a provider's sidecar is running and ready, starting it lazily if needed.
/// Called exclusively from the actor thread — no lock contention, no TOCTOU race.
fn ensure_provider_impl(
    providers: &mut HashMap<String, ProviderProcess>,
    config: &SidecarConfig,
    sink: &Arc<dyn EventSink>,
    provider: &str,
) -> Result<(), String> {
    // Sync ready state from atomic flag (set by stdout reader thread)
    if let Some(p) = providers.get_mut(provider) {
        if !p.ready && p.ready_flag.load(std::sync::atomic::Ordering::Acquire) {
            p.ready = true;
        }
        if p.ready {
            return Ok(());
        }
        // Started but not ready yet -- fall through to wait loop
    } else {
        // Not started -- start it now. No TOCTOU: we own the HashMap exclusively.
        start_provider_impl(providers, config, sink, provider)?;
    }

    // Wait for ready (up to 10 seconds)
    for _ in 0..100 {
        std::thread::sleep(std::time::Duration::from_millis(100));

        if let Some(p) = providers.get_mut(provider) {
            if !p.ready && p.ready_flag.load(std::sync::atomic::Ordering::Acquire) {
                p.ready = true;
            }
            if p.ready {
                return Ok(());
            }
        } else {
            return Err(format!("{} sidecar process exited before ready", provider));
        }
    }
    Err(format!(
        "{} sidecar did not become ready within timeout",
        provider
    ))
}

/// Send a JSON message to a provider's stdin.
fn send_to_provider_impl(
    providers: &mut HashMap<String, ProviderProcess>,
    provider: &str,
    msg: &serde_json::Value,
) -> Result<(), String> {
    let proc = providers
        .get_mut(provider)
        .ok_or_else(|| format!("{} sidecar not running", provider))?;

    let line =
        serde_json::to_string(msg).map_err(|e| format!("JSON serialize error: {e}"))?;

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

/// Build the NDJSON query message from AgentQueryOptions.
fn build_query_msg(options: &AgentQueryOptions) -> serde_json::Value {
    serde_json::json!({
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
    })
}

impl SidecarManager {
    pub fn new(sink: Arc<dyn EventSink>, config: SidecarConfig) -> Self {
        let (req_tx, req_rx) = std_mpsc::channel();

        let handle = thread::spawn(move || {
            run_actor(req_rx, sink, config);
        });

        Self {
            tx: req_tx,
            _actor_thread: Some(handle),
        }
    }

    /// Update the sandbox configuration. Takes effect on next sidecar (re)start.
    pub fn set_sandbox(&self, sandbox: SandboxConfig) {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        if self
            .tx
            .send(ProviderRequest::SetSandbox {
                sandbox,
                reply: reply_tx,
            })
            .is_ok()
        {
            let _ = reply_rx.recv();
        }
    }

    /// Start the default (claude) provider sidecar. Called on app startup.
    pub fn start(&self) -> Result<(), String> {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        self.tx
            .send(ProviderRequest::Start { reply: reply_tx })
            .map_err(|_| "Sidecar actor stopped".to_string())?;
        reply_rx
            .recv()
            .map_err(|_| "Sidecar actor stopped".to_string())?
    }

    pub fn query(&self, options: &AgentQueryOptions) -> Result<(), String> {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        self.tx
            .send(ProviderRequest::EnsureAndQuery {
                options: options.clone(),
                reply: reply_tx,
            })
            .map_err(|_| "Sidecar actor stopped".to_string())?;
        reply_rx
            .recv()
            .map_err(|_| "Sidecar actor stopped".to_string())?
    }

    pub fn stop_session(&self, session_id: &str) -> Result<(), String> {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        self.tx
            .send(ProviderRequest::StopSession {
                session_id: session_id.to_string(),
                reply: reply_tx,
            })
            .map_err(|_| "Sidecar actor stopped".to_string())?;
        reply_rx
            .recv()
            .map_err(|_| "Sidecar actor stopped".to_string())?
    }

    pub fn restart(&self) -> Result<(), String> {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        self.tx
            .send(ProviderRequest::Restart { reply: reply_tx })
            .map_err(|_| "Sidecar actor stopped".to_string())?;
        reply_rx
            .recv()
            .map_err(|_| "Sidecar actor stopped".to_string())?
    }

    pub fn shutdown(&self) -> Result<(), String> {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        if self
            .tx
            .send(ProviderRequest::Shutdown { reply: reply_tx })
            .is_ok()
        {
            let _ = reply_rx.recv();
        }
        Ok(())
    }

    /// Returns true if the default (claude) provider sidecar is ready.
    pub fn is_ready(&self) -> bool {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        if self
            .tx
            .send(ProviderRequest::IsReady { reply: reply_tx })
            .is_ok()
        {
            reply_rx.recv().unwrap_or(false)
        } else {
            false
        }
    }

    /// Legacy send_message — routes to the default (claude) provider.
    pub fn send_message(&self, msg: &serde_json::Value) -> Result<(), String> {
        let (reply_tx, reply_rx) = std_mpsc::channel();
        self.tx
            .send(ProviderRequest::SendMessage {
                msg: msg.clone(),
                reply: reply_tx,
            })
            .map_err(|_| "Sidecar actor stopped".to_string())?;
        reply_rx
            .recv()
            .map_err(|_| "Sidecar actor stopped".to_string())?
    }

    /// Resolve a sidecar command for a specific provider's runner file.
    fn resolve_sidecar_for_provider_with_config(
        config: &SidecarConfig,
        provider: &str,
    ) -> Result<SidecarCommand, String> {
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
        // Send shutdown request to the actor. If the channel is already closed
        // (actor thread exited), this is a no-op.
        let (reply_tx, reply_rx) = std_mpsc::channel();
        if self
            .tx
            .send(ProviderRequest::Shutdown { reply: reply_tx })
            .is_ok()
        {
            // Wait briefly for the actor to clean up (with timeout to avoid hanging)
            let _ = reply_rx.recv_timeout(std::time::Duration::from_secs(5));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

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

    // ---- Actor pattern tests ----

    /// Mock EventSink that records emitted events.
    struct MockSink {
        events: Mutex<Vec<(String, serde_json::Value)>>,
    }

    impl MockSink {
        fn new() -> Self {
            Self {
                events: Mutex::new(Vec::new()),
            }
        }
    }

    impl EventSink for MockSink {
        fn emit(&self, event: &str, payload: serde_json::Value) {
            self.events
                .lock()
                .unwrap()
                .push((event.to_string(), payload));
        }
    }

    #[test]
    fn test_actor_new_and_drop() {
        // SidecarManager should create and drop cleanly without panicking
        let sink: Arc<dyn EventSink> = Arc::new(MockSink::new());
        let config = SidecarConfig {
            search_paths: vec![],
            env_overrides: Default::default(),
            sandbox: Default::default(),
        };
        let manager = SidecarManager::new(sink, config);
        // is_ready should return false since no provider started
        assert!(!manager.is_ready());
        // Drop should send shutdown cleanly
        drop(manager);
    }

    #[test]
    fn test_actor_shutdown_idempotent() {
        let sink: Arc<dyn EventSink> = Arc::new(MockSink::new());
        let config = SidecarConfig {
            search_paths: vec![],
            env_overrides: Default::default(),
            sandbox: Default::default(),
        };
        let manager = SidecarManager::new(sink, config);
        // Multiple shutdowns should not panic
        assert!(manager.shutdown().is_ok());
        assert!(manager.shutdown().is_ok());
    }

    #[test]
    fn test_actor_set_sandbox() {
        let sink: Arc<dyn EventSink> = Arc::new(MockSink::new());
        let config = SidecarConfig {
            search_paths: vec![],
            env_overrides: Default::default(),
            sandbox: Default::default(),
        };
        let manager = SidecarManager::new(sink, config);
        // set_sandbox should complete without error
        manager.set_sandbox(SandboxConfig {
            rw_paths: vec![PathBuf::from("/tmp")],
            ro_paths: vec![],
            enabled: true,
        });
    }

    #[test]
    fn test_build_query_msg_fields() {
        let options = AgentQueryOptions {
            provider: "claude".to_string(),
            session_id: "s1".to_string(),
            prompt: "hello".to_string(),
            cwd: Some("/tmp".to_string()),
            max_turns: Some(5),
            max_budget_usd: None,
            resume_session_id: None,
            permission_mode: Some("bypassPermissions".to_string()),
            setting_sources: None,
            system_prompt: None,
            model: Some("claude-4-opus".to_string()),
            claude_config_dir: None,
            additional_directories: None,
            worktree_name: None,
            provider_config: serde_json::Value::Null,
            extra_env: Default::default(),
        };
        let msg = build_query_msg(&options);
        assert_eq!(msg["type"], "query");
        assert_eq!(msg["provider"], "claude");
        assert_eq!(msg["sessionId"], "s1");
        assert_eq!(msg["prompt"], "hello");
        assert_eq!(msg["cwd"], "/tmp");
        assert_eq!(msg["maxTurns"], 5);
        assert_eq!(msg["model"], "claude-4-opus");
    }

    #[test]
    fn test_concurrent_queries_no_race() {
        // This test verifies that concurrent query() calls from multiple threads
        // are serialized by the actor and don't cause a TOCTOU race on ensure_provider.
        // Since we can't actually start a sidecar in tests (no runner scripts),
        // we verify that the actor handles multiple concurrent requests gracefully
        // (all get errors, none panic or deadlock).

        let sink: Arc<dyn EventSink> = Arc::new(MockSink::new());
        let config = SidecarConfig {
            search_paths: vec![], // No search paths → start_provider will fail
            env_overrides: Default::default(),
            sandbox: Default::default(),
        };
        let manager = Arc::new(SidecarManager::new(sink, config));

        let mut handles = vec![];
        let errors = Arc::new(Mutex::new(Vec::new()));

        // Spawn 10 concurrent query() calls
        for i in 0..10 {
            let mgr = manager.clone();
            let errs = errors.clone();
            handles.push(thread::spawn(move || {
                let options = AgentQueryOptions {
                    provider: "test-provider".to_string(),
                    session_id: format!("session-{}", i),
                    prompt: "hello".to_string(),
                    cwd: None,
                    max_turns: None,
                    max_budget_usd: None,
                    resume_session_id: None,
                    permission_mode: None,
                    setting_sources: None,
                    system_prompt: None,
                    model: None,
                    claude_config_dir: None,
                    additional_directories: None,
                    worktree_name: None,
                    provider_config: serde_json::Value::Null,
                    extra_env: Default::default(),
                };
                let result = mgr.query(&options);
                if let Err(e) = result {
                    errs.lock().unwrap().push(e);
                }
            }));
        }

        for h in handles {
            h.join().expect("Thread should not panic");
        }

        // All 10 should have failed (no sidecar scripts available), but none panicked
        let errs = errors.lock().unwrap();
        assert_eq!(errs.len(), 10, "All 10 concurrent queries should get errors");

        // The key invariant: no "Sidecar for 'X' already running" error.
        // Because the actor serializes requests, the second caller sees the first's
        // start_provider result (either success or failure), not a conflicting start.
        // With no search paths, all errors should be "Sidecar not found" style.
        for err in errs.iter() {
            assert!(
                !err.contains("already running"),
                "Should not get 'already running' error from serialized actor. Got: {err}"
            );
        }
    }
}
