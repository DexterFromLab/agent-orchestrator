mod ctx;
mod pty;
mod sidecar;
mod watcher;
mod session;

use ctx::CtxDb;
use pty::{PtyManager, PtyOptions};
use session::{Session, SessionDb, LayoutState, SshSession};
use sidecar::{AgentQueryOptions, SidecarManager};
use watcher::FileWatcherManager;
use std::sync::Arc;
use tauri::State;

struct AppState {
    pty_manager: Arc<PtyManager>,
    sidecar_manager: Arc<SidecarManager>,
    session_db: Arc<SessionDb>,
    file_watcher: Arc<FileWatcherManager>,
    ctx_db: Arc<CtxDb>,
}

// --- PTY commands ---

#[tauri::command]
fn pty_spawn(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    options: PtyOptions,
) -> Result<String, String> {
    state.pty_manager.spawn(&app, options)
}

#[tauri::command]
fn pty_write(state: State<'_, AppState>, id: String, data: String) -> Result<(), String> {
    state.pty_manager.write(&id, &data)
}

#[tauri::command]
fn pty_resize(
    state: State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.pty_manager.resize(&id, cols, rows)
}

#[tauri::command]
fn pty_kill(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.pty_manager.kill(&id)
}

// --- Agent/sidecar commands ---

#[tauri::command]
fn agent_query(
    state: State<'_, AppState>,
    options: AgentQueryOptions,
) -> Result<(), String> {
    state.sidecar_manager.query(&options)
}

#[tauri::command]
fn agent_stop(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state.sidecar_manager.stop_session(&session_id)
}

#[tauri::command]
fn agent_ready(state: State<'_, AppState>) -> bool {
    state.sidecar_manager.is_ready()
}

#[tauri::command]
fn agent_restart(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.sidecar_manager.restart(&app)
}

// --- File watcher commands ---

#[tauri::command]
fn file_watch(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    pane_id: String,
    path: String,
) -> Result<String, String> {
    state.file_watcher.watch(&app, &pane_id, &path)
}

#[tauri::command]
fn file_unwatch(state: State<'_, AppState>, pane_id: String) {
    state.file_watcher.unwatch(&pane_id);
}

#[tauri::command]
fn file_read(state: State<'_, AppState>, path: String) -> Result<String, String> {
    state.file_watcher.read_file(&path)
}

// --- Session persistence commands ---

#[tauri::command]
fn session_list(state: State<'_, AppState>) -> Result<Vec<Session>, String> {
    state.session_db.list_sessions()
}

#[tauri::command]
fn session_save(state: State<'_, AppState>, session: Session) -> Result<(), String> {
    state.session_db.save_session(&session)
}

#[tauri::command]
fn session_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.session_db.delete_session(&id)
}

#[tauri::command]
fn session_update_title(state: State<'_, AppState>, id: String, title: String) -> Result<(), String> {
    state.session_db.update_title(&id, &title)
}

#[tauri::command]
fn session_touch(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.session_db.touch_session(&id)
}

#[tauri::command]
fn session_update_group(state: State<'_, AppState>, id: String, group_name: String) -> Result<(), String> {
    state.session_db.update_group(&id, &group_name)
}

#[tauri::command]
fn layout_save(state: State<'_, AppState>, layout: LayoutState) -> Result<(), String> {
    state.session_db.save_layout(&layout)
}

#[tauri::command]
fn layout_load(state: State<'_, AppState>) -> Result<LayoutState, String> {
    state.session_db.load_layout()
}

// --- Settings commands ---

#[tauri::command]
fn settings_get(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state.session_db.get_setting(&key)
}

#[tauri::command]
fn settings_set(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    state.session_db.set_setting(&key, &value)
}

#[tauri::command]
fn settings_list(state: State<'_, AppState>) -> Result<Vec<(String, String)>, String> {
    state.session_db.get_all_settings()
}

// --- SSH session commands ---

#[tauri::command]
fn ssh_session_list(state: State<'_, AppState>) -> Result<Vec<SshSession>, String> {
    state.session_db.list_ssh_sessions()
}

#[tauri::command]
fn ssh_session_save(state: State<'_, AppState>, session: SshSession) -> Result<(), String> {
    state.session_db.save_ssh_session(&session)
}

#[tauri::command]
fn ssh_session_delete(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.session_db.delete_ssh_session(&id)
}

// --- ctx commands ---

#[tauri::command]
fn ctx_list_projects(state: State<'_, AppState>) -> Result<Vec<ctx::CtxProject>, String> {
    state.ctx_db.list_projects()
}

#[tauri::command]
fn ctx_get_context(state: State<'_, AppState>, project: String) -> Result<Vec<ctx::CtxEntry>, String> {
    state.ctx_db.get_context(&project)
}

#[tauri::command]
fn ctx_get_shared(state: State<'_, AppState>) -> Result<Vec<ctx::CtxEntry>, String> {
    state.ctx_db.get_shared()
}

#[tauri::command]
fn ctx_get_summaries(state: State<'_, AppState>, project: String, limit: i64) -> Result<Vec<ctx::CtxSummary>, String> {
    state.ctx_db.get_summaries(&project, limit)
}

#[tauri::command]
fn ctx_search(state: State<'_, AppState>, query: String) -> Result<Vec<ctx::CtxEntry>, String> {
    state.ctx_db.search(&query)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pty_manager = Arc::new(PtyManager::new());
    let sidecar_manager = Arc::new(SidecarManager::new());

    // Initialize session database in app data directory
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("bterminal");
    let session_db = Arc::new(
        SessionDb::open(&data_dir).expect("Failed to open session database")
    );

    let file_watcher = Arc::new(FileWatcherManager::new());
    let ctx_db = Arc::new(CtxDb::new());

    let app_state = AppState {
        pty_manager,
        sidecar_manager: sidecar_manager.clone(),
        session_db,
        file_watcher,
        ctx_db,
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            agent_query,
            agent_stop,
            agent_ready,
            agent_restart,
            file_watch,
            file_unwatch,
            file_read,
            session_list,
            session_save,
            session_delete,
            session_update_title,
            session_touch,
            session_update_group,
            layout_save,
            layout_load,
            settings_get,
            settings_set,
            settings_list,
            ssh_session_list,
            ssh_session_save,
            ssh_session_delete,
            ctx_list_projects,
            ctx_get_context,
            ctx_get_shared,
            ctx_get_summaries,
            ctx_search,
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start sidecar on app launch
            match sidecar_manager.start(app.handle()) {
                Ok(()) => log::info!("Sidecar startup initiated"),
                Err(e) => log::warn!("Sidecar startup failed (agent features unavailable): {e}"),
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
