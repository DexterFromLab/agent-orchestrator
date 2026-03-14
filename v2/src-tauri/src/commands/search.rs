use crate::AppState;
use crate::search::SearchResult;
use tauri::State;

#[tauri::command]
pub fn search_init(state: State<'_, AppState>) -> Result<(), String> {
    // SearchDb is already initialized during app setup; this is a no-op
    // but allows the frontend to confirm readiness.
    let _db = &state.search_db;
    Ok(())
}

#[tauri::command]
pub fn search_query(
    state: State<'_, AppState>,
    query: String,
    limit: Option<i32>,
) -> Result<Vec<SearchResult>, String> {
    state.search_db.search_all(&query, limit.unwrap_or(20))
}

#[tauri::command]
pub fn search_rebuild(state: State<'_, AppState>) -> Result<(), String> {
    state.search_db.rebuild_index()
}

#[tauri::command]
pub fn search_index_message(
    state: State<'_, AppState>,
    session_id: String,
    role: String,
    content: String,
) -> Result<(), String> {
    state.search_db.index_message(&session_id, &role, &content)
}

#[tauri::command]
pub fn search_index_task(
    state: State<'_, AppState>,
    task_id: String,
    title: String,
    description: String,
    status: String,
    assigned_to: String,
) -> Result<(), String> {
    state.search_db.index_task(&task_id, &title, &description, &status, &assigned_to)
}

#[tauri::command]
pub fn search_index_btmsg(
    state: State<'_, AppState>,
    msg_id: String,
    from_agent: String,
    to_agent: String,
    content: String,
    channel: String,
) -> Result<(), String> {
    state.search_db.index_btmsg(&msg_id, &from_agent, &to_agent, &content, &channel)
}
