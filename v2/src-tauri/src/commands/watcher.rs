use tauri::State;
use crate::AppState;
use crate::fs_watcher::FsWatcherStatus;

#[tauri::command]
pub fn file_watch(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    pane_id: String,
    path: String,
) -> Result<String, String> {
    state.file_watcher.watch(&app, &pane_id, &path)
}

#[tauri::command]
pub fn file_unwatch(state: State<'_, AppState>, pane_id: String) {
    state.file_watcher.unwatch(&pane_id);
}

#[tauri::command]
pub fn file_read(state: State<'_, AppState>, path: String) -> Result<String, String> {
    state.file_watcher.read_file(&path)
}

#[tauri::command]
pub fn fs_watch_project(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    cwd: String,
) -> Result<(), String> {
    state.fs_watcher.watch_project(&app, &project_id, &cwd)
}

#[tauri::command]
pub fn fs_unwatch_project(state: State<'_, AppState>, project_id: String) {
    state.fs_watcher.unwatch_project(&project_id);
}

#[tauri::command]
pub fn fs_watcher_status(state: State<'_, AppState>) -> FsWatcherStatus {
    state.fs_watcher.status()
}
