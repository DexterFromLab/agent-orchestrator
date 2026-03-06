// Sidecar lifecycle management (Deno-first, Node.js fallback)
// Spawns agent-runner-deno.ts (or agent-runner.mjs), communicates via stdio NDJSON

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentQueryOptions {
    pub session_id: String,
    pub prompt: String,
    pub cwd: Option<String>,
    pub max_turns: Option<u32>,
    pub max_budget_usd: Option<f64>,
    pub resume_session_id: Option<String>,
}

struct SidecarCommand {
    program: String,
    args: Vec<String>,
}

pub struct SidecarManager {
    child: Arc<Mutex<Option<Child>>>,
    stdin_writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    ready: Arc<Mutex<bool>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin_writer: Arc::new(Mutex::new(None)),
            ready: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self, app: &AppHandle) -> Result<(), String> {
        let mut child_lock = self.child.lock().unwrap();
        if child_lock.is_some() {
            return Err("Sidecar already running".to_string());
        }

        // Resolve sidecar command (Deno-first, Node.js fallback)
        let cmd = Self::resolve_sidecar_command(app)?;

        log::info!("Starting sidecar: {} {}", cmd.program, cmd.args.join(" "));

        let mut child = Command::new(&cmd.program)
            .args(&cmd.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start sidecar: {e}"))?;

        let child_stdin = child.stdin.take().ok_or("Failed to capture sidecar stdin")?;
        let child_stdout = child.stdout.take().ok_or("Failed to capture sidecar stdout")?;
        let child_stderr = child.stderr.take().ok_or("Failed to capture sidecar stderr")?;

        *self.stdin_writer.lock().unwrap() = Some(Box::new(child_stdin));

        // Stdout reader thread — forwards NDJSON to Tauri events
        let app_handle = app.clone();
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
                                // Check for ready signal
                                if msg.get("type").and_then(|t| t.as_str()) == Some("ready") {
                                    *ready.lock().unwrap() = true;
                                    log::info!("Sidecar ready");
                                }
                                let _ = app_handle.emit("sidecar-message", &msg);
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
            let _ = app_handle.emit("sidecar-exited", ());
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
        let writer = writer_lock
            .as_mut()
            .ok_or("Sidecar not running")?;

        let line = serde_json::to_string(msg)
            .map_err(|e| format!("JSON serialize error: {e}"))?;

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

    pub fn restart(&self, app: &AppHandle) -> Result<(), String> {
        log::info!("Restarting sidecar");
        let _ = self.shutdown();
        self.start(app)
    }

    pub fn shutdown(&self) -> Result<(), String> {
        let mut child_lock = self.child.lock().unwrap();
        if let Some(ref mut child) = *child_lock {
            log::info!("Shutting down sidecar");
            // Drop stdin to signal EOF
            *self.stdin_writer.lock().unwrap() = None;
            // Give it a moment, then kill
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

    fn resolve_sidecar_command(app: &AppHandle) -> Result<SidecarCommand, String> {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {e}"))?;

        let dev_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf();

        // Try Deno first (runs TypeScript directly, no build step needed)
        let deno_paths = [
            resource_dir.join("sidecar").join("agent-runner-deno.ts"),
            dev_root.join("sidecar").join("agent-runner-deno.ts"),
        ];

        for path in &deno_paths {
            if path.exists() {
                // Check if deno is available
                if Command::new("deno").arg("--version").output().is_ok() {
                    return Ok(SidecarCommand {
                        program: "deno".to_string(),
                        args: vec![
                            "run".to_string(),
                            "--allow-run".to_string(),
                            "--allow-env".to_string(),
                            "--allow-read".to_string(),
                            path.to_string_lossy().to_string(),
                        ],
                    });
                }
                log::warn!("Deno sidecar found at {} but deno not in PATH, falling back to Node.js", path.display());
            }
        }

        // Fallback to Node.js
        let node_paths = [
            resource_dir.join("sidecar").join("dist").join("agent-runner.mjs"),
            dev_root.join("sidecar").join("dist").join("agent-runner.mjs"),
        ];

        for path in &node_paths {
            if path.exists() {
                return Ok(SidecarCommand {
                    program: "node".to_string(),
                    args: vec![path.to_string_lossy().to_string()],
                });
            }
        }

        Err(format!(
            "Sidecar not found. Checked Deno ({}, {}) and Node.js ({}, {})",
            deno_paths[0].display(),
            deno_paths[1].display(),
            node_paths[0].display(),
            node_paths[1].display(),
        ))
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}
