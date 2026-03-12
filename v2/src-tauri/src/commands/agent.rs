use tauri::State;
use crate::AppState;
use crate::sidecar::AgentQueryOptions;
use bterminal_core::sandbox::SandboxConfig;

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

/// Update sidecar sandbox configuration and restart to apply.
/// `project_cwds` — directories needing read+write access.
/// `worktree_roots` — optional worktree directories.
/// `enabled` — whether Landlock sandboxing is active.
#[tauri::command]
#[tracing::instrument(skip(state))]
pub fn agent_set_sandbox(
    state: State<'_, AppState>,
    project_cwds: Vec<String>,
    worktree_roots: Vec<String>,
    enabled: bool,
) -> Result<(), String> {
    let cwd_refs: Vec<&str> = project_cwds.iter().map(|s| s.as_str()).collect();
    let wt_refs: Vec<&str> = worktree_roots.iter().map(|s| s.as_str()).collect();

    let mut sandbox = SandboxConfig::for_projects(&cwd_refs, &wt_refs);
    sandbox.enabled = enabled;

    state.sidecar_manager.set_sandbox(sandbox);

    // Restart sidecar so Landlock restrictions take effect on the new process
    if state.sidecar_manager.is_ready() {
        state.sidecar_manager.restart()?;
    }

    Ok(())
}
