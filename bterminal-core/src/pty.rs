use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufReader, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use uuid::Uuid;

use crate::event::EventSink;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PtyOptions {
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub args: Option<Vec<String>>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
    sink: Arc<dyn EventSink>,
}

impl PtyManager {
    pub fn new(sink: Arc<dyn EventSink>) -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
            sink,
        }
    }

    pub fn spawn(&self, options: PtyOptions) -> Result<String, String> {
        let pty_system = native_pty_system();
        let cols = options.cols.unwrap_or(80);
        let rows = options.rows.unwrap_or(24);

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {e}"))?;

        let shell = options.shell.unwrap_or_else(|| {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        });

        let mut cmd = CommandBuilder::new(&shell);
        if let Some(args) = &options.args {
            for arg in args {
                cmd.arg(arg);
            }
        }
        if let Some(cwd) = &options.cwd {
            cmd.cwd(cwd);
        }

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {e}"))?;

        drop(pair.slave);

        let id = Uuid::new_v4().to_string();
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {e}"))?;

        let event_id = id.clone();
        let sink = self.sink.clone();
        thread::spawn(move || {
            let mut buf_reader = BufReader::with_capacity(4096, reader);
            let mut buf = vec![0u8; 4096];
            loop {
                match std::io::Read::read(&mut buf_reader, &mut buf) {
                    Ok(0) => {
                        sink.emit(
                            &format!("pty-exit-{event_id}"),
                            serde_json::Value::Null,
                        );
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        sink.emit(
                            &format!("pty-data-{event_id}"),
                            serde_json::Value::String(data),
                        );
                    }
                    Err(e) => {
                        log::error!("PTY read error for {event_id}: {e}");
                        sink.emit(
                            &format!("pty-exit-{event_id}"),
                            serde_json::Value::Null,
                        );
                        break;
                    }
                }
            }
        });

        let instance = PtyInstance {
            master: pair.master,
            writer,
        };
        self.instances.lock().unwrap().insert(id.clone(), instance);

        log::info!("Spawned PTY {id} ({shell})");
        Ok(id)
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        let instance = instances
            .get_mut(id)
            .ok_or_else(|| format!("PTY {id} not found"))?;
        instance
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("PTY write error: {e}"))?;
        instance
            .writer
            .flush()
            .map_err(|e| format!("PTY flush error: {e}"))?;
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instances = self.instances.lock().unwrap();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("PTY {id} not found"))?;
        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("PTY resize error: {e}"))?;
        Ok(())
    }

    pub fn kill(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().unwrap();
        if instances.remove(id).is_some() {
            log::info!("Killed PTY {id}");
            Ok(())
        } else {
            Err(format!("PTY {id} not found"))
        }
    }

    /// List active PTY session IDs.
    pub fn list_sessions(&self) -> Vec<String> {
        self.instances.lock().unwrap().keys().cloned().collect()
    }
}
