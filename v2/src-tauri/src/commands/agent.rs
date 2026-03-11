use tauri::State;
use crate::AppState;
use crate::sidecar::AgentQueryOptions;

#[tauri::command]
#[tracing::instrument(skip(state, options), fields(session_id = %options.session_id))]
pub fn agent_query(
    state: State<'_, AppState>,
    options: AgentQueryOptions,
) -> Result<(), String> {
    state.sidecar_manager.query(&options)
}

#[tauri::command]
#[tracing::instrument(skip(state))]
pub fn agent_stop(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state.sidecar_manager.stop_session(&session_id)
}

#[tauri::command]
pub fn agent_ready(state: State<'_, AppState>) -> bool {
    state.sidecar_manager.is_ready()
}

#[tauri::command]
#[tracing::instrument(skip(state))]
pub fn agent_restart(state: State<'_, AppState>) -> Result<(), String> {
    state.sidecar_manager.restart()
}
