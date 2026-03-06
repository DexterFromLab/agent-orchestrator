/// Trait for emitting events from PTY and sidecar managers.
/// Implemented by Tauri's AppHandle (controller) and WebSocket sender (relay).
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: serde_json::Value);
}
