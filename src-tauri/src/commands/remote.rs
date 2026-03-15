use tauri::State;
use crate::AppState;
use crate::remote::{self, RemoteMachineConfig, RemoteMachineInfo};
use crate::pty::PtyOptions;
use crate::sidecar::AgentQueryOptions;

#[tauri::command]
pub async fn remote_list(state: State<'_, AppState>) -> Result<Vec<RemoteMachineInfo>, String> {
    Ok(state.remote_manager.list_machines().await)
}

#[tauri::command]
pub async fn remote_add(state: State<'_, AppState>, config: RemoteMachineConfig) -> Result<String, String> {
    Ok(state.remote_manager.add_machine(config).await)
}

#[tauri::command]
pub async fn remote_remove(state: State<'_, AppState>, machine_id: String) -> Result<(), String> {
    state.remote_manager.remove_machine(&machine_id).await
}

#[tauri::command]
#[tracing::instrument(skip(app, state))]
pub async fn remote_connect(app: tauri::AppHandle, state: State<'_, AppState>, machine_id: String) -> Result<(), String> {
    state.remote_manager.connect(&app, &machine_id).await
}

#[tauri::command]
#[tracing::instrument(skip(state))]
pub async fn remote_disconnect(state: State<'_, AppState>, machine_id: String) -> Result<(), String> {
    state.remote_manager.disconnect(&machine_id).await
}

#[tauri::command]
#[tracing::instrument(skip(state, options), fields(session_id = %options.session_id))]
pub async fn remote_agent_query(state: State<'_, AppState>, machine_id: String, options: AgentQueryOptions) -> Result<(), String> {
    state.remote_manager.agent_query(&machine_id, &options).await
}

#[tauri::command]
#[tracing::instrument(skip(state))]
pub async fn remote_agent_stop(state: State<'_, AppState>, machine_id: String, session_id: String) -> Result<(), String> {
    state.remote_manager.agent_stop(&machine_id, &session_id).await
}

#[tauri::command]
#[tracing::instrument(skip(state), fields(shell = ?options.shell))]
pub async fn remote_pty_spawn(state: State<'_, AppState>, machine_id: String, options: PtyOptions) -> Result<String, String> {
    state.remote_manager.pty_spawn(&machine_id, &options).await
}

#[tauri::command]
pub async fn remote_pty_write(state: State<'_, AppState>, machine_id: String, id: String, data: String) -> Result<(), String> {
    state.remote_manager.pty_write(&machine_id, &id, &data).await
}

#[tauri::command]
pub async fn remote_pty_resize(state: State<'_, AppState>, machine_id: String, id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.remote_manager.pty_resize(&machine_id, &id, cols, rows).await
}

#[tauri::command]
pub async fn remote_pty_kill(state: State<'_, AppState>, machine_id: String, id: String) -> Result<(), String> {
    state.remote_manager.pty_kill(&machine_id, &id).await
}

// --- SPKI certificate pinning ---

#[tauri::command]
#[tracing::instrument]
pub async fn remote_probe_spki(url: String) -> Result<String, String> {
    remote::probe_spki_hash(&url).await
}

#[tauri::command]
#[tracing::instrument(skip(state))]
pub async fn remote_add_pin(state: State<'_, AppState>, machine_id: String, pin: String) -> Result<(), String> {
    state.remote_manager.add_spki_pin(&machine_id, pin).await
}

#[tauri::command]
#[tracing::instrument(skip(state))]
pub async fn remote_remove_pin(state: State<'_, AppState>, machine_id: String, pin: String) -> Result<(), String> {
    state.remote_manager.remove_spki_pin(&machine_id, &pin).await
}
