use tauri::State;
use crate::AppState;
use crate::{ctx, memora};

// --- ctx commands ---

#[tauri::command]
pub fn ctx_init_db(state: State<'_, AppState>) -> Result<(), String> {
    state.ctx_db.init_db()
}

#[tauri::command]
pub fn ctx_register_project(state: State<'_, AppState>, name: String, description: String, work_dir: Option<String>) -> Result<(), String> {
    state.ctx_db.register_project(&name, &description, work_dir.as_deref())
}

#[tauri::command]
pub fn ctx_get_context(state: State<'_, AppState>, project: String) -> Result<Vec<ctx::CtxEntry>, String> {
    state.ctx_db.get_context(&project)
}

#[tauri::command]
pub fn ctx_get_shared(state: State<'_, AppState>) -> Result<Vec<ctx::CtxEntry>, String> {
    state.ctx_db.get_shared()
}

#[tauri::command]
pub fn ctx_get_summaries(state: State<'_, AppState>, project: String, limit: i64) -> Result<Vec<ctx::CtxSummary>, String> {
    state.ctx_db.get_summaries(&project, limit)
}

#[tauri::command]
pub fn ctx_search(state: State<'_, AppState>, query: String) -> Result<Vec<ctx::CtxEntry>, String> {
    state.ctx_db.search(&query)
}

// --- Memora commands (read-only) ---

#[tauri::command]
pub fn memora_available(state: State<'_, AppState>) -> bool {
    state.memora_db.is_available()
}

#[tauri::command]
pub fn memora_list(
    state: State<'_, AppState>,
    tags: Option<Vec<String>>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<memora::MemoraSearchResult, String> {
    state.memora_db.list(tags, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
pub fn memora_search(
    state: State<'_, AppState>,
    query: String,
    tags: Option<Vec<String>>,
    limit: Option<i64>,
) -> Result<memora::MemoraSearchResult, String> {
    state.memora_db.search(&query, tags, limit.unwrap_or(50))
}

#[tauri::command]
pub fn memora_get(state: State<'_, AppState>, id: i64) -> Result<Option<memora::MemoraNode>, String> {
    state.memora_db.get(id)
}
