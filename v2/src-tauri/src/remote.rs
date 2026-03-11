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
    /// Cancellation signal — set to true to stop reconnect loops for this machine
    cancelled: Arc<std::sync::atomic::AtomicBool>,
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

    pub async fn list_machines(&self) -> Vec<RemoteMachineInfo> {
        let machines = self.machines.lock().await;
        machines.values().map(|m| RemoteMachineInfo {
            id: m.id.clone(),
            label: m.config.label.clone(),
            url: m.config.url.clone(),
            status: m.status.clone(),
            auto_connect: m.config.auto_connect,
        }).collect()
    }

    pub async fn add_machine(&self, config: RemoteMachineConfig) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let machine = RemoteMachine {
            id: id.clone(),
            config,
            status: "disconnected".to_string(),
            connection: None,
            cancelled: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        self.machines.lock().await.insert(id.clone(), machine);
        id
    }

    pub async fn remove_machine(&self, machine_id: &str) -> Result<(), String> {
        let mut machines = self.machines.lock().await;
        if let Some(machine) = machines.get_mut(machine_id) {
            // Signal cancellation to stop any reconnect loops
            machine.cancelled.store(true, std::sync::atomic::Ordering::Relaxed);
            // Abort connection tasks before removing to prevent resource leaks
            if let Some(conn) = machine.connection.take() {
                conn._handle.abort();
            }
        }
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
            // Reset cancellation flag for new connection
            machine.cancelled.store(false, std::sync::atomic::Ordering::Relaxed);
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
        let cancelled_flag = {
            let machines = self.machines.lock().await;
            machines.get(machine_id).map(|m| m.cancelled.clone())
                .unwrap_or_else(|| Arc::new(std::sync::atomic::AtomicBool::new(false)))
        };
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
                                "pty_created" => {
                                    // Relay confirmed PTY spawn — emit with real PTY ID
                                    let _ = app_handle.emit("remote-pty-created", &serde_json::json!({
                                        "machineId": mid,
                                        "ptyId": event.session_id,
                                        "commandId": event.payload.as_ref().and_then(|p| p.get("commandId")).and_then(|v| v.as_str()),
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

            // Mark disconnected and clear connection
            {
                let mut machines = machines_ref.lock().await;
                if let Some(machine) = machines.get_mut(&mid) {
                    machine.status = "disconnected".to_string();
                    machine.connection = None;
                }
            }
            let _ = app_handle.emit("remote-machine-disconnected", &serde_json::json!({
                "machineId": mid,
            }));

            // Exponential backoff reconnection (1s, 2s, 4s, 8s, 16s, 30s cap)
            let reconnect_machines = machines_ref.clone();
            let reconnect_app = app_handle.clone();
            let reconnect_mid = mid.clone();
            let reconnect_cancelled = cancelled_flag.clone();
            tokio::spawn(async move {
                let mut delay = std::time::Duration::from_secs(1);
                let max_delay = std::time::Duration::from_secs(30);

                loop {
                    tokio::time::sleep(delay).await;

                    // Check cancellation flag first (set by remove_machine/disconnect)
                    if reconnect_cancelled.load(std::sync::atomic::Ordering::Relaxed) {
                        log::info!("Reconnection cancelled (machine removed) for {reconnect_mid}");
                        break;
                    }

                    // Check if machine still exists and wants reconnection
                    let should_reconnect = {
                        let machines = reconnect_machines.lock().await;
                        machines.get(&reconnect_mid)
                            .map(|m| m.status == "disconnected" && m.connection.is_none())
                            .unwrap_or(false)
                    };

                    if !should_reconnect {
                        log::info!("Reconnection cancelled for machine {reconnect_mid}");
                        break;
                    }

                    log::info!("Attempting reconnection to {reconnect_mid} (backoff: {}s)", delay.as_secs());
                    let _ = reconnect_app.emit("remote-machine-reconnecting", &serde_json::json!({
                        "machineId": reconnect_mid,
                        "backoffSecs": delay.as_secs(),
                    }));

                    // Try to get URL for TCP probe
                    let url = {
                        let machines = reconnect_machines.lock().await;
                        machines.get(&reconnect_mid).map(|m| m.config.url.clone())
                    };

                    if let Some(url) = url {
                        if attempt_tcp_probe(&url).await.is_ok() {
                            log::info!("Reconnection probe succeeded for {reconnect_mid}");
                            // Mark as ready for reconnection — frontend should call connect()
                            let _ = reconnect_app.emit("remote-machine-reconnect-ready", &serde_json::json!({
                                "machineId": reconnect_mid,
                            }));
                            break;
                        }
                    } else {
                        break; // Machine removed
                    }

                    delay = std::cmp::min(delay * 2, max_delay);
                }
            });
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
        // Signal cancellation to stop any reconnect loops
        machine.cancelled.store(true, std::sync::atomic::Ordering::Relaxed);
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

/// Probe whether a relay is reachable via TCP connect only (no WS upgrade).
/// This avoids allocating per-connection resources (PtyManager, SidecarManager) on the relay.
async fn attempt_tcp_probe(url: &str) -> Result<(), String> {
    let host = extract_host(url).ok_or_else(|| "Invalid URL".to_string())?;
    // Parse host:port, default to 9750 if no port
    let addr = if host.contains(':') {
        host.clone()
    } else {
        format!("{host}:9750")
    };

    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    .map_err(|_| "Connection timeout".to_string())?
    .map_err(|e| format!("TCP connect failed: {e}"))?;

    Ok(())
}

fn extract_host(url: &str) -> Option<String> {
    url.replace("wss://", "")
        .replace("ws://", "")
        .split('/')
        .next()
        .map(|s| s.to_string())
}
