use tauri::State;
use crate::AppState;
use crate::session::{Session, LayoutState, SshSession};

// --- Session persistence ---

#[tauri::command]
pub fn session_list(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    state.session_db.list_sessions()
}

#[tauri::command]
pub fn session_save(state: State<'_, AppState>, session: Session) -> Result<(), String> {
    state.session_db.save_session(&session)
}

#[tauri::command]
pub fn session_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.session_db.delete_session(&id)
}

#[tauri::command]
pub fn session_update_title(state: State<'_, AppState>, id: String, title: String) -> Result<(), String> {
    state.session_db.update_title(&id, &title)
}

#[tauri::command]
pub fn session_touch(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.session_db.touch_session(&id)
}

#[tauri::command]
pub fn session_update_group(state: State<'_, AppState>, id: String, group_name: String) -> Result<(), String> {
    state.session_db.update_group(&id, &group_name)
}

// --- Layout ---

#[tauri::command]
pub fn layout_save(state: State<'_, AppState>, layout: LayoutState) -> Result<(), String> {
    state.session_db.save_layout(&layout)
}

#[tauri::command]
pub fn layout_load(state: State<'_, AppState>) -> Result<LayoutState, String> {
    state.session_db.load_layout()
}

// --- Settings ---

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state.session_db.get_setting(&key)
}

#[tauri::command]
pub fn settings_set(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    state.session_db.set_setting(&key, &value)
}

#[tauri::command]
pub fn settings_list(state: State<'_, AppState>) -> Result<Vec<(String, String)>, String> {
    state.session_db.get_all_settings()
}

// --- SSH sessions ---

#[tauri::command]
pub fn ssh_session_list(state: State<'_, AppState>) -> Result<Vec<SshSession>, String> {
    state.session_db.list_ssh_sessions()
}

#[tauri::command]
pub fn ssh_session_save(state: State<'_, AppState>, session: SshSession) -> Result<(), String> {
    state.session_db.save_ssh_session(&session)
}

#[tauri::command]
pub fn ssh_session_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.session_db.delete_ssh_session(&id)
}
