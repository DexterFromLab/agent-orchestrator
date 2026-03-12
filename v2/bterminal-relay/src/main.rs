// bterminal-relay — WebSocket relay server for remote PTY and agent management

use bterminal_core::event::EventSink;
use bterminal_core::pty::{PtyManager, PtyOptions};
use bterminal_core::sidecar::{AgentQueryOptions, SidecarConfig, SidecarManager};
use clap::Parser;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::http;

#[derive(Parser)]
#[command(name = "bterminal-relay", about = "BTerminal remote relay server")]
struct Cli {
    /// Port to listen on
    #[arg(short, long, default_value = "9750")]
    port: u16,

    /// Authentication token (required)
    #[arg(short, long)]
    token: String,

    /// Allow insecure ws:// connections (dev mode only)
    #[arg(long, default_value = "false")]
    insecure: bool,

    /// Additional sidecar search paths
    #[arg(long)]
    sidecar_path: Vec<String>,
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
    #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<serde_json::Value>,
}

/// EventSink that sends events as JSON over an mpsc channel (forwarded to WebSocket).
struct WsEventSink {
    tx: mpsc::UnboundedSender<RelayEvent>,
}

impl EventSink for WsEventSink {
    fn emit(&self, event: &str, payload: serde_json::Value) {
        // Parse event name to extract session ID for PTY events like "pty-data-{id}"
        let (type_, session_id) = if let Some(id) = event.strip_prefix("pty-data-") {
            ("pty_data".to_string(), Some(id.to_string()))
        } else if let Some(id) = event.strip_prefix("pty-exit-") {
            ("pty_exit".to_string(), Some(id.to_string()))
        } else {
            (event.replace('-', "_"), None)
        };

        let _ = self.tx.send(RelayEvent {
            type_,
            session_id,
            payload: if payload.is_null() { None } else { Some(payload) },
        });
    }
}

#[tokio::main]
async fn main() {
    env_logger::init();
    let cli = Cli::parse();

    let addr = SocketAddr::from(([0, 0, 0, 0], cli.port));
    let listener = TcpListener::bind(&addr).await.expect("Failed to bind");
    log::info!("bterminal-relay listening on {addr}");

    // Build sidecar config
    let mut search_paths: Vec<std::path::PathBuf> = cli
        .sidecar_path
        .iter()
        .map(std::path::PathBuf::from)
        .collect();
    // Default: look in current dir and next to binary
    if let Ok(exe_dir) = std::env::current_exe().map(|p| p.parent().unwrap().to_path_buf()) {
        search_paths.push(exe_dir.join("sidecar"));
    }
    search_paths.push(std::path::PathBuf::from("sidecar"));

    let sidecar_config = SidecarConfig {
        search_paths,
        env_overrides: std::collections::HashMap::new(),
        sandbox: Default::default(),
    };
    let token = Arc::new(cli.token);

    // Rate limiting state for auth failures
    let auth_failures: Arc<tokio::sync::Mutex<std::collections::HashMap<SocketAddr, (u32, std::time::Instant)>>> =
        Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));

    while let Ok((stream, peer)) = listener.accept().await {
        let token = token.clone();
        let sidecar_config = sidecar_config.clone();
        let auth_failures = auth_failures.clone();

        tokio::spawn(async move {
            // Check rate limit
            {
                let mut failures = auth_failures.lock().await;
                if let Some((count, last)) = failures.get(&peer) {
                    if *count >= 10 && last.elapsed() < std::time::Duration::from_secs(300) {
                        log::warn!("Rate limited: {peer}");
                        return;
                    }
                    // Reset after cooldown
                    if last.elapsed() >= std::time::Duration::from_secs(300) {
                        failures.remove(&peer);
                    }
                }
            }

            if let Err(e) = handle_connection(stream, peer, &token, &sidecar_config, &auth_failures).await {
                log::error!("Connection error from {peer}: {e}");
            }
        });
    }
}

async fn handle_connection(
    stream: TcpStream,
    peer: SocketAddr,
    expected_token: &str,
    sidecar_config: &SidecarConfig,
    auth_failures: &tokio::sync::Mutex<std::collections::HashMap<SocketAddr, (u32, std::time::Instant)>>,
) -> Result<(), String> {
    // Accept WebSocket with auth validation
    let ws_stream = tokio_tungstenite::accept_hdr_async(stream, |req: &http::Request<()>, response: http::Response<()>| {
        // Validate auth token from headers
        let auth = req.headers().get("authorization").and_then(|v| v.to_str().ok());
        match auth {
            Some(value) if value == format!("Bearer {expected_token}") => Ok(response),
            _ => {
                Err(http::Response::builder()
                    .status(http::StatusCode::UNAUTHORIZED)
                    .body(Some("Invalid token".to_string()))
                    .unwrap())
            }
        }
    })
    .await
    .map_err(|e| {
        // Record auth failure
        let _ = auth_failures.try_lock().map(|mut f| {
            let entry = f.entry(peer).or_insert((0, std::time::Instant::now()));
            entry.0 += 1;
            entry.1 = std::time::Instant::now();
        });
        format!("WebSocket handshake failed: {e}")
    })?;

    log::info!("Client connected: {peer}");

    // Set up event channel — shared between EventSink and command response sender
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<RelayEvent>();
    let sink_tx = event_tx.clone();
    let sink: Arc<dyn EventSink> = Arc::new(WsEventSink { tx: event_tx });

    // Create managers for this connection
    let pty_manager = Arc::new(PtyManager::new(sink.clone()));
    let sidecar_manager = Arc::new(SidecarManager::new(sink, sidecar_config.clone()));

    // Start sidecar
    if let Err(e) = sidecar_manager.start() {
        log::warn!("Sidecar startup failed for {peer}: {e}");
    }

    let (mut ws_tx, mut ws_rx) = ws_stream.split();

    // Send ready signal
    let ready_event = RelayEvent {
        type_: "ready".to_string(),
        session_id: None,
        payload: None,
    };
    let _ = ws_tx
        .send(Message::Text(serde_json::to_string(&ready_event).unwrap()))
        .await;

    // Forward events to WebSocket
    let event_writer = tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            if let Ok(json) = serde_json::to_string(&event) {
                if ws_tx.send(Message::Text(json)).await.is_err() {
                    break;
                }
            }
        }
    });

    // Process incoming commands
    let pty_mgr = pty_manager.clone();
    let sidecar_mgr = sidecar_manager.clone();
    let response_tx = sink_tx;
    let command_reader = tokio::spawn(async move {
        while let Some(msg) = ws_rx.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(cmd) = serde_json::from_str::<RelayCommand>(&text) {
                        handle_relay_command(&pty_mgr, &sidecar_mgr, &response_tx, cmd).await;
                    }
                }
                Ok(Message::Close(_)) => break,
                Err(e) => {
                    log::error!("WebSocket read error from {peer}: {e}");
                    break;
                }
                _ => {}
            }
        }
    });

    // Wait for either task to finish
    tokio::select! {
        _ = event_writer => {}
        _ = command_reader => {}
    }

    // Cleanup
    let _ = sidecar_manager.shutdown();
    log::info!("Client disconnected: {peer}");

    Ok(())
}

async fn handle_relay_command(
    pty: &PtyManager,
    sidecar: &SidecarManager,
    response_tx: &mpsc::UnboundedSender<RelayEvent>,
    cmd: RelayCommand,
) {
    match cmd.type_.as_str() {
        "ping" => {
            let _ = response_tx.send(RelayEvent {
                type_: "pong".to_string(),
                session_id: None,
                payload: None,
            });
        }
        "pty_create" => {
            let options: PtyOptions = match serde_json::from_value(cmd.payload) {
                Ok(opts) => opts,
                Err(e) => {
                    send_error(response_tx, &cmd.id, &format!("Invalid pty_create payload: {e}"));
                    return;
                }
            };
            match pty.spawn(options) {
                Ok(pty_id) => {
                    log::info!("Spawned remote PTY: {pty_id}");
                    let _ = response_tx.send(RelayEvent {
                        type_: "pty_created".to_string(),
                        session_id: Some(pty_id),
                        payload: Some(serde_json::json!({ "commandId": cmd.id })),
                    });
                }
                Err(e) => send_error(response_tx, &cmd.id, &format!("Failed to spawn PTY: {e}")),
            }
        }
        "pty_write" => {
            if let (Some(id), Some(data)) = (
                cmd.payload.get("id").and_then(|v| v.as_str()),
                cmd.payload.get("data").and_then(|v| v.as_str()),
            ) {
                if let Err(e) = pty.write(id, data) {
                    send_error(response_tx, &cmd.id, &format!("PTY write error: {e}"));
                }
            }
        }
        "pty_resize" => {
            if let (Some(id), Some(cols), Some(rows)) = (
                cmd.payload.get("id").and_then(|v| v.as_str()),
                cmd.payload.get("cols").and_then(|v| v.as_u64()),
                cmd.payload.get("rows").and_then(|v| v.as_u64()),
            ) {
                if let Err(e) = pty.resize(id, cols as u16, rows as u16) {
                    send_error(response_tx, &cmd.id, &format!("PTY resize error: {e}"));
                }
            }
        }
        "pty_close" => {
            if let Some(id) = cmd.payload.get("id").and_then(|v| v.as_str()) {
                if let Err(e) = pty.kill(id) {
                    send_error(response_tx, &cmd.id, &format!("PTY kill error: {e}"));
                }
            }
        }
        "agent_query" => {
            let options: AgentQueryOptions = match serde_json::from_value(cmd.payload) {
                Ok(opts) => opts,
                Err(e) => {
                    send_error(response_tx, &cmd.id, &format!("Invalid agent_query payload: {e}"));
                    return;
                }
            };
            if let Err(e) = sidecar.query(&options) {
                send_error(response_tx, &cmd.id, &format!("Agent query error: {e}"));
            }
        }
        "agent_stop" => {
            if let Some(session_id) = cmd.payload.get("sessionId").and_then(|v| v.as_str()) {
                if let Err(e) = sidecar.stop_session(session_id) {
                    send_error(response_tx, &cmd.id, &format!("Agent stop error: {e}"));
                }
            }
        }
        "sidecar_restart" => {
            if let Err(e) = sidecar.restart() {
                send_error(response_tx, &cmd.id, &format!("Sidecar restart error: {e}"));
            }
        }
        other => {
            log::warn!("Unknown relay command: {other}");
        }
    }
}

fn send_error(tx: &mpsc::UnboundedSender<RelayEvent>, cmd_id: &str, message: &str) {
    log::error!("{message}");
    let _ = tx.send(RelayEvent {
        type_: "error".to_string(),
        session_id: None,
        payload: Some(serde_json::json!({
            "commandId": cmd_id,
            "message": message,
        })),
    });
}
