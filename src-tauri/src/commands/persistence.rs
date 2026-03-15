use tauri::State;
use crate::AppState;
use crate::session::{AgentMessageRecord, ProjectAgentState, SessionMetric, SessionAnchorRecord};

// --- Agent message persistence ---

#[tauri::command]
pub fn agent_messages_save(
    state: State<'_, AppState>,
    session_id: String,
    project_id: String,
    sdk_session_id: Option<String>,
    messages: Vec<AgentMessageRecord>,
) -> Result<(), String> {
    state.session_db.save_agent_messages(
        &session_id,
        &project_id,
        sdk_session_id.as_deref(),
        &messages,
    )
}

#[tauri::command]
pub fn agent_messages_load(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<AgentMessageRecord>, String> {
    state.session_db.load_agent_messages(&project_id)
}

// --- Project agent state ---

#[tauri::command]
pub fn project_agent_state_save(
    state: State<'_, AppState>,
    agent_state: ProjectAgentState,
) -> Result<(), String> {
    state.session_db.save_project_agent_state(&agent_state)
}

#[tauri::command]
pub fn project_agent_state_load(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Option<ProjectAgentState>, String> {
    state.session_db.load_project_agent_state(&project_id)
}

// --- Session metrics ---

#[tauri::command]
pub fn session_metric_save(
    state: State<'_, AppState>,
    metric: SessionMetric,
) -> Result<(), String> {
    state.session_db.save_session_metric(&metric)
}

#[tauri::command]
pub fn session_metrics_load(
    state: State<'_, AppState>,
    project_id: String,
    limit: i64,
) -> Result<Vec<SessionMetric>, String> {
    state.session_db.load_session_metrics(&project_id, limit)
}

// --- Session anchors ---

#[tauri::command]
pub fn session_anchors_save(
    state: State<'_, AppState>,
    anchors: Vec<SessionAnchorRecord>,
) -> Result<(), String> {
    state.session_db.save_session_anchors(&anchors)
}

#[tauri::command]
pub fn session_anchors_load(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<SessionAnchorRecord>, String> {
    state.session_db.load_session_anchors(&project_id)
}

#[tauri::command]
pub fn session_anchor_delete(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.session_db.delete_session_anchor(&id)
}

#[tauri::command]
pub fn session_anchors_clear(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    state.session_db.delete_project_anchors(&project_id)
}

#[tauri::command]
pub fn session_anchor_update_type(
    state: State<'_, AppState>,
    id: String,
    anchor_type: String,
) -> Result<(), String> {
    state.session_db.update_anchor_type(&id, &anchor_type)
}
