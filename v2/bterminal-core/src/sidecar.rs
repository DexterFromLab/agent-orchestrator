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
    pub session_id: String,
    pub prompt: String,
    pub cwd: Option<String>,
    pub max_turns: Option<u32>,
    pub max_budget_usd: Option<f64>,
    pub resume_session_id: Option<String>,
    pub permission_mode: Option<String>,
}

/// Directories to search for sidecar scripts.
#[derive(Debug, Clone)]
pub struct SidecarConfig {
    pub search_paths: Vec<PathBuf>,
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

        // Build a clean environment stripping all CLAUDE* vars to prevent
        // the SDK from detecting nesting when BTerminal is launched from a Claude Code terminal
        let clean_env: Vec<(String, String)> = std::env::vars()
            .filter(|(k, _)| !k.starts_with("CLAUDE"))
            .collect();

        let mut child = Command::new(&cmd.program)
            .args(&cmd.args)
            .env_clear()
            .envs(clean_env)
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

        let msg = serde_json::json!({
            "type": "query",
            "sessionId": options.session_id,
            "prompt": options.prompt,
            "cwd": options.cwd,
            "maxTurns": options.max_turns,
            "maxBudgetUsd": options.max_budget_usd,
            "resumeSessionId": options.resume_session_id,
            "permissionMode": options.permission_mode,
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

    fn resolve_sidecar_command(&self) -> Result<SidecarCommand, String> {
        // Single bundled .mjs works with both Deno and Node.js.
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
            let mjs_path = base.join("dist").join("agent-runner.mjs");
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
            "Sidecar not found. Checked: {}{}",
            paths.join(", "),
            runtime_note,
        ))
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}
