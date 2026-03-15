use tauri::State;
use crate::AppState;
use crate::pty::PtyOptions;

#[tauri::command]
#[tracing::instrument(skip(state), fields(shell = ?options.shell))]
pub fn pty_spawn(
    state: State<'_, AppState>,
    options: PtyOptions,
) -> Result<String, String> {
    state.pty_manager.spawn(options)
}

#[tauri::command]
pub fn pty_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    state.pty_manager.write(&id, &data)
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.pty_manager.resize(&id, cols, rows)
}

#[tauri::command]
#[tracing::instrument(skip(state))]
pub fn pty_kill(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.pty_manager.kill(&id)
}
