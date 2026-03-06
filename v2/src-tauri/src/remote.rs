// Remote machine management — WebSocket client connections to bterminal-relay instances

use bterminal_core::pty::PtyOptions;
use bterminal_core::sidecar::AgentQueryOptions;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, mpsc};
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteMachineConfig {
    pub label: String,
    pub url: String,
    pub token: String,
    pub auto_connect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteMachineInfo {
    pub id: String,
    pub label: String,
    pub url: String,
    pub status: String,
    pub auto_connect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RelayCommand {
    id: String,
    #[serde(rename = "type")]
    type_: String,
    payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RelayEvent {
    #[serde(rename = "type")]
    type_: String,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    #[serde(rename = "machineId")]
    machine_id: Option<String>,
    payload: Option<serde_json::Value>,
}

struct WsConnection {
    tx: mpsc::UnboundedSender<String>,
    _handle: tokio::task::JoinHandle<()>,
}

struct RemoteMachine {
    id: String,
    config: RemoteMachineConfig,
    status: String,
    connection: Option<WsConnection>,
}

pub struct RemoteManager {
    machines: Arc<Mutex<HashMap<String, RemoteMachine>>>,
}

impl RemoteManager {
    pub fn new() -> Self {
        Self {
            machines: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn list_machines(&self) -> Vec<RemoteMachineInfo> {
        // Use try_lock for sync context (called from Tauri command handler)
        let machines = self.machines.try_lock();
        match machines {
            Ok(m) => m.values().map(|m| RemoteMachineInfo {
                id: m.id.clone(),
                label: m.config.label.clone(),
                url: m.config.url.clone(),
                status: m.status.clone(),
                auto_connect: m.config.auto_connect,
            }).collect(),
            Err(_) => Vec::new(),
        }
    }

    pub fn add_machine(&self, config: RemoteMachineConfig) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let machine = RemoteMachine {
            id: id.clone(),
            config,
            status: "disconnected".to_string(),
            connection: None,
        };
        // Use try_lock for sync context
        if let Ok(mut machines) = self.machines.try_lock() {
            machines.insert(id.clone(), machine);
        }
        id
    }

    pub fn remove_machine(&self, machine_id: &str) -> Result<(), String> {
        let mut machines = self.machines.try_lock()
            .map_err(|_| "Lock contention".to_string())?;
        machines.remove(machine_id)
            .ok_or_else(|| format!("Machine {machine_id} not found"))?;
        Ok(())
    }

    pub async fn connect(&self, app: &AppHandle, machine_id: &str) -> Result<(), String> {
        let (url, token) = {
            let mut machines = self.machines.lock().await;
            let machine = machines.get_mut(machine_id)
                .ok_or_else(|| format!("Machine {machine_id} not found"))?;
            if machine.connection.is_some() {
                return Err("Already connected".to_string());
            }
            machine.status = "connecting".to_string();
            (machine.config.url.clone(), machine.config.token.clone())
        };

        // Build WebSocket request with auth header
        let request = tokio_tungstenite::tungstenite::http::Request::builder()
            .uri(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Sec-WebSocket-Key", tokio_tungstenite::tungstenite::handshake::client::generate_key())
            .header("Sec-WebSocket-Version", "13")
            .header("Connection", "Upgrade")
            .header("Upgrade", "websocket")
            .header("Host", extract_host(&url).unwrap_or_default())
            .body(())
            .map_err(|e| format!("Failed to build request: {e}"))?;

        let (ws_stream, _) = tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| format!("WebSocket connect failed: {e}"))?;

        let (mut ws_tx, mut ws_rx) = ws_stream.split();

        // Channel for sending messages to the WebSocket
        let (send_tx, mut send_rx) = mpsc::unbounded_channel::<String>();

        // Writer task — forwards channel messages to WebSocket
        let writer_handle = tokio::spawn(async move {
            while let Some(msg) = send_rx.recv().await {
                if ws_tx.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        });

        // Reader task — forwards WebSocket messages to Tauri events
        let app_handle = app.clone();
        let mid = machine_id.to_string();
        let machines_ref = self.machines.clone();
        let reader_handle = tokio::spawn(async move {
            while let Some(msg) = ws_rx.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(mut event) = serde_json::from_str::<RelayEvent>(&text) {
                            event.machine_id = Some(mid.clone());
                            // Route relay events to Tauri events
                            match event.type_.as_str() {
                                "sidecar_message" => {
                                    if let Some(payload) = &event.payload {
                                        let _ = app_handle.emit("remote-sidecar-message", &serde_json::json!({
                                            "machineId": mid,
                                            "sessionId": event.session_id,
                                            "event": payload,
                                        }));
                                    }
                                }
                                "pty_data" => {
                                    if let Some(payload) = &event.payload {
                                        let _ = app_handle.emit("remote-pty-data", &serde_json::json!({
                                            "machineId": mid,
                                            "sessionId": event.session_id,
                                            "data": payload,
                                        }));
                                    }
                                }
                                "pty_exit" => {
                                    let _ = app_handle.emit("remote-pty-exit", &serde_json::json!({
                                        "machineId": mid,
                                        "sessionId": event.session_id,
                                    }));
                                }
                                "ready" => {
                                    let _ = app_handle.emit("remote-machine-ready", &serde_json::json!({
                                        "machineId": mid,
                                    }));
                                }
                                "state_sync" => {
                                    let _ = app_handle.emit("remote-state-sync", &serde_json::json!({
                                        "machineId": mid,
                                        "payload": event.payload,
                                    }));
                                }
                                "pong" => {} // heartbeat response, ignore
                                "error" => {
                                    let _ = app_handle.emit("remote-error", &serde_json::json!({
                                        "machineId": mid,
                                        "error": event.payload,
                                    }));
                                }
                                _ => {
                                    log::warn!("Unknown relay event type: {}", event.type_);
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => break,
                    Err(e) => {
                        log::error!("WebSocket read error for machine {mid}: {e}");
                        break;
                    }
                    _ => {}
                }
            }

            // Mark disconnected
            if let Ok(mut machines) = machines_ref.try_lock() {
                if let Some(machine) = machines.get_mut(&mid) {
                    machine.status = "disconnected".to_string();
                    machine.connection = None;
                }
            }
            let _ = app_handle.emit("remote-machine-disconnected", &serde_json::json!({
                "machineId": mid,
            }));
        });

        // Combine reader + writer into one handle
        let combined_handle = tokio::spawn(async move {
            tokio::select! {
                _ = reader_handle => {}
                _ = writer_handle => {}
            }
        });

        // Store connection
        let mut machines = self.machines.lock().await;
        if let Some(machine) = machines.get_mut(machine_id) {
            machine.status = "connected".to_string();
            machine.connection = Some(WsConnection {
                tx: send_tx,
                _handle: combined_handle,
            });
        }

        // Start heartbeat
        let ping_tx = {
            let machines = self.machines.lock().await;
            machines.get(machine_id).and_then(|m| m.connection.as_ref().map(|c| c.tx.clone()))
        };
        if let Some(tx) = ping_tx {
            let mid = machine_id.to_string();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
                loop {
                    interval.tick().await;
                    let ping = serde_json::json!({"id": "", "type": "ping", "payload": {}});
                    if tx.send(ping.to_string()).is_err() {
                        log::info!("Heartbeat stopped for machine {mid}");
                        break;
                    }
                }
            });
        }

        Ok(())
    }

    pub async fn disconnect(&self, machine_id: &str) -> Result<(), String> {
        let mut machines = self.machines.lock().await;
        let machine = machines.get_mut(machine_id)
            .ok_or_else(|| format!("Machine {machine_id} not found"))?;
        if let Some(conn) = machine.connection.take() {
            conn._handle.abort();
        }
        machine.status = "disconnected".to_string();
        Ok(())
    }

    // --- Remote command helpers ---

    async fn send_command(&self, machine_id: &str, cmd: RelayCommand) -> Result<(), String> {
        let machines = self.machines.lock().await;
        let machine = machines.get(machine_id)
            .ok_or_else(|| format!("Machine {machine_id} not found"))?;
        let conn = machine.connection.as_ref()
            .ok_or_else(|| format!("Machine {machine_id} not connected"))?;
        let json = serde_json::to_string(&cmd)
            .map_err(|e| format!("Serialize error: {e}"))?;
        conn.tx.send(json)
            .map_err(|_| format!("Send channel closed for machine {machine_id}"))
    }

    pub async fn agent_query(&self, machine_id: &str, options: &AgentQueryOptions) -> Result<(), String> {
        self.send_command(machine_id, RelayCommand {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "agent_query".to_string(),
            payload: serde_json::to_value(options).unwrap_or_default(),
        }).await
    }

    pub async fn agent_stop(&self, machine_id: &str, session_id: &str) -> Result<(), String> {
        self.send_command(machine_id, RelayCommand {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "agent_stop".to_string(),
            payload: serde_json::json!({ "sessionId": session_id }),
        }).await
    }

    pub async fn pty_spawn(&self, machine_id: &str, options: &PtyOptions) -> Result<String, String> {
        // Send spawn command; the relay will respond with the PTY ID via a relay event
        let cmd_id = uuid::Uuid::new_v4().to_string();
        self.send_command(machine_id, RelayCommand {
            id: cmd_id.clone(),
            type_: "pty_create".to_string(),
            payload: serde_json::to_value(options).unwrap_or_default(),
        }).await?;
        // Return the command ID as a placeholder; the real PTY ID comes via event
        Ok(cmd_id)
    }

    pub async fn pty_write(&self, machine_id: &str, id: &str, data: &str) -> Result<(), String> {
        self.send_command(machine_id, RelayCommand {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "pty_write".to_string(),
            payload: serde_json::json!({ "id": id, "data": data }),
        }).await
    }

    pub async fn pty_resize(&self, machine_id: &str, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        self.send_command(machine_id, RelayCommand {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "pty_resize".to_string(),
            payload: serde_json::json!({ "id": id, "cols": cols, "rows": rows }),
        }).await
    }

    pub async fn pty_kill(&self, machine_id: &str, id: &str) -> Result<(), String> {
        self.send_command(machine_id, RelayCommand {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "pty_close".to_string(),
            payload: serde_json::json!({ "id": id }),
        }).await
    }
}

fn extract_host(url: &str) -> Option<String> {
    url.replace("wss://", "")
        .replace("ws://", "")
        .split('/')
        .next()
        .map(|s| s.to_string())
}
