use bterminal_core::event::EventSink;
use tauri::{AppHandle, Emitter};

/// Bridges bterminal-core's EventSink trait to Tauri's event system.
pub struct TauriEventSink(pub AppHandle);

impl EventSink for TauriEventSink {
    fn emit(&self, event: &str, payload: serde_json::Value) {
        let _ = self.0.emit(event, &payload);
    }
}
