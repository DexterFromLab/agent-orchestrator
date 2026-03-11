mod ctx;
mod event_sink;
mod fs_watcher;
mod groups;
mod memora;
mod pty;
mod remote;
mod sidecar;
mod session;
mod telemetry;
mod watcher;

use ctx::CtxDb;
use event_sink::TauriEventSink;
use groups::{GroupsFile, MdFileEntry};
use pty::{PtyManager, PtyOptions};
use remote::{RemoteManager, RemoteMachineConfig};
use session::{Session, SessionDb, LayoutState, SshSession, AgentMessageRecord, ProjectAgentState};
use sidecar::{AgentQueryOptions, SidecarConfig, SidecarManager};
use fs_watcher::{FsWatcherStatus, ProjectFsWatcher};
use watcher::FileWatcherManager;
use std::sync::Arc;
use tauri::{Manager, State};

struct AppState {
    pty_manager: Arc<PtyManager>,
    sidecar_manager: Arc<SidecarManager>,
    session_db: Arc<SessionDb>,
    file_watcher: Arc<FileWatcherManager>,
    fs_watcher: Arc<ProjectFsWatcher>,
    ctx_db: Arc<CtxDb>,
    memora_db: Arc<memora::MemoraDb>,
    remote_manager: Arc<RemoteManager>,
    _telemetry: telemetry::TelemetryGuard,
}

// --- PTY commands ---

#[tauri::command]
#[tracing::instrument(skip(state), fields(shell = ?options.shell))]
fn pty_spawn(
    state: State<'_, AppState>,
    options: PtyOptions,
) -> Result<String, String> {
    state.pty_manager.spawn(options)
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
#[tracing::instrument(skip(state))]
fn pty_kill(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.pty_manager.kill(&id)
}

// --- Agent/sidecar commands ---

#[tauri::command]
#[tracing::instrument(skip(state, options), fields(session_id = %options.session_id))]
fn agent_query(
    state: State<'_, AppState>,
    options: AgentQueryOptions,
) -> Result<(), String> {
    state.sidecar_manager.query(&options)
}

#[tauri::command]
#[tracing::instrument(skip(state))]
fn agent_stop(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state.sidecar_manager.stop_session(&session_id)
}

#[tauri::command]
fn agent_ready(state: State<'_, AppState>) -> bool {
    state.sidecar_manager.is_ready()
}

#[tauri::command]
#[tracing::instrument(skip(state))]
fn agent_restart(state: State<'_, AppState>) -> Result<(), String> {
    state.sidecar_manager.restart()
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

// --- Project filesystem watcher commands (S-1 Phase 2) ---

#[tauri::command]
fn fs_watch_project(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    cwd: String,
) -> Result<(), String> {
    state.fs_watcher.watch_project(&app, &project_id, &cwd)
}

#[tauri::command]
fn fs_unwatch_project(state: State<'_, AppState>, project_id: String) {
    state.fs_watcher.unwatch_project(&project_id);
}

#[tauri::command]
fn fs_watcher_status(state: State<'_, AppState>) -> FsWatcherStatus {
    state.fs_watcher.status()
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
fn ctx_init_db(state: State<'_, AppState>) -> Result<(), String> {
    state.ctx_db.init_db()
}

#[tauri::command]
fn ctx_register_project(state: State<'_, AppState>, name: String, description: String, work_dir: Option<String>) -> Result<(), String> {
    state.ctx_db.register_project(&name, &description, work_dir.as_deref())
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

// --- Memora commands (read-only) ---

#[tauri::command]
fn memora_available(state: State<'_, AppState>) -> bool {
    state.memora_db.is_available()
}

#[tauri::command]
fn memora_list(
    state: State<'_, AppState>,
    tags: Option<Vec<String>>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<memora::MemoraSearchResult, String> {
    state.memora_db.list(tags, limit.unwrap_or(50), offset.unwrap_or(0))
}

#[tauri::command]
fn memora_search(
    state: State<'_, AppState>,
    query: String,
    tags: Option<Vec<String>>,
    limit: Option<i64>,
) -> Result<memora::MemoraSearchResult, String> {
    state.memora_db.search(&query, tags, limit.unwrap_or(50))
}

#[tauri::command]
fn memora_get(state: State<'_, AppState>, id: i64) -> Result<Option<memora::MemoraNode>, String> {
    state.memora_db.get(id)
}

// --- Claude profile commands (switcher-claude integration) ---

#[derive(serde::Serialize)]
struct ClaudeProfile {
    name: String,
    email: Option<String>,
    subscription_type: Option<String>,
    display_name: Option<String>,
    config_dir: String,
}

#[tauri::command]
fn claude_list_profiles() -> Vec<ClaudeProfile> {
    let mut profiles = Vec::new();

    // Read profiles from ~/.config/switcher/profiles/
    let config_dir = dirs::config_dir().unwrap_or_default();
    let profiles_dir = config_dir.join("switcher").join("profiles");
    let alt_dir_root = config_dir.join("switcher-claude");

    if let Ok(entries) = std::fs::read_dir(&profiles_dir) {
        for entry in entries.flatten() {
            if !entry.path().is_dir() { continue; }
            let name = entry.file_name().to_string_lossy().to_string();

            // Read profile.toml for metadata
            let toml_path = entry.path().join("profile.toml");
            let (email, subscription_type, display_name) = if toml_path.exists() {
                let content = std::fs::read_to_string(&toml_path).unwrap_or_else(|e| {
                    log::warn!("Failed to read {}: {e}", toml_path.display());
                    String::new()
                });
                (
                    extract_toml_value(&content, "email"),
                    extract_toml_value(&content, "subscription_type"),
                    extract_toml_value(&content, "display_name"),
                )
            } else {
                (None, None, None)
            };

            // Alt dir for CLAUDE_CONFIG_DIR
            let alt_path = alt_dir_root.join(&name);
            let config_dir_str = if alt_path.exists() {
                alt_path.to_string_lossy().to_string()
            } else {
                // Fallback to default ~/.claude
                dirs::home_dir()
                    .unwrap_or_default()
                    .join(".claude")
                    .to_string_lossy()
                    .to_string()
            };

            profiles.push(ClaudeProfile {
                name,
                email,
                subscription_type,
                display_name,
                config_dir: config_dir_str,
            });
        }
    }

    // Always include a "default" profile for ~/.claude
    if profiles.is_empty() {
        let home = dirs::home_dir().unwrap_or_default();
        profiles.push(ClaudeProfile {
            name: "default".to_string(),
            email: None,
            subscription_type: None,
            display_name: None,
            config_dir: home.join(".claude").to_string_lossy().to_string(),
        });
    }

    profiles
}

fn extract_toml_value(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(key) {
            if let Some(rest) = rest.trim().strip_prefix('=') {
                let val = rest.trim().trim_matches('"');
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}

// --- Skill discovery commands ---

#[derive(serde::Serialize)]
struct ClaudeSkill {
    name: String,
    description: String,
    source_path: String,
}

#[tauri::command]
fn claude_list_skills() -> Vec<ClaudeSkill> {
    let mut skills = Vec::new();
    let home = dirs::home_dir().unwrap_or_default();

    // Search for skills in ~/.claude/skills/ (same as Claude Code CLI)
    let skills_dir = home.join(".claude").join("skills");
    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            // Skills can be directories with SKILL.md or standalone .md files
            let (name, skill_file) = if path.is_dir() {
                let skill_md = path.join("SKILL.md");
                if skill_md.exists() {
                    (entry.file_name().to_string_lossy().to_string(), skill_md)
                } else {
                    continue;
                }
            } else if path.extension().map_or(false, |e| e == "md") {
                let stem = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                (stem, path.clone())
            } else {
                continue;
            };

            // Extract description from first non-empty, non-heading line
            let description = if let Ok(content) = std::fs::read_to_string(&skill_file) {
                content.lines()
                    .filter(|l| !l.trim().is_empty() && !l.starts_with('#'))
                    .next()
                    .unwrap_or("")
                    .trim()
                    .chars()
                    .take(120)
                    .collect()
            } else {
                String::new()
            };

            skills.push(ClaudeSkill {
                name,
                description,
                source_path: skill_file.to_string_lossy().to_string(),
            });
        }
    }

    skills
}

#[tauri::command]
fn claude_read_skill(path: String) -> Result<String, String> {
    // Validate path is under ~/.claude/skills/ to prevent path traversal
    let skills_dir = dirs::home_dir()
        .ok_or("Cannot determine home directory")?
        .join(".claude")
        .join("skills");
    let canonical_skills = skills_dir.canonicalize()
        .map_err(|_| "Skills directory does not exist".to_string())?;
    let canonical_path = std::path::Path::new(&path).canonicalize()
        .map_err(|e| format!("Invalid skill path: {e}"))?;
    if !canonical_path.starts_with(&canonical_skills) {
        return Err("Access denied: path is outside skills directory".to_string());
    }
    std::fs::read_to_string(&canonical_path).map_err(|e| format!("Failed to read skill: {e}"))
}

// --- Group config commands (v3) ---

#[tauri::command]
fn groups_load() -> Result<GroupsFile, String> {
    groups::load_groups()
}

#[tauri::command]
fn groups_save(config: GroupsFile) -> Result<(), String> {
    groups::save_groups(&config)
}

#[tauri::command]
fn discover_markdown_files(cwd: String) -> Result<Vec<MdFileEntry>, String> {
    groups::discover_markdown_files(&cwd)
}

// --- Agent message persistence commands (v3) ---

#[tauri::command]
fn agent_messages_save(
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
fn agent_messages_load(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<AgentMessageRecord>, String> {
    state.session_db.load_agent_messages(&project_id)
}

#[tauri::command]
fn project_agent_state_save(
    state: State<'_, AppState>,
    agent_state: ProjectAgentState,
) -> Result<(), String> {
    state.session_db.save_project_agent_state(&agent_state)
}

#[tauri::command]
fn project_agent_state_load(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Option<ProjectAgentState>, String> {
    state.session_db.load_project_agent_state(&project_id)
}

// --- Session metrics commands ---

#[tauri::command]
fn session_metric_save(
    state: State<'_, AppState>,
    metric: session::SessionMetric,
) -> Result<(), String> {
    state.session_db.save_session_metric(&metric)
}

#[tauri::command]
fn session_metrics_load(
    state: State<'_, AppState>,
    project_id: String,
    limit: i64,
) -> Result<Vec<session::SessionMetric>, String> {
    state.session_db.load_session_metrics(&project_id, limit)
}

// --- Session anchor commands ---

#[tauri::command]
fn session_anchors_save(
    state: State<'_, AppState>,
    anchors: Vec<session::SessionAnchorRecord>,
) -> Result<(), String> {
    state.session_db.save_session_anchors(&anchors)
}

#[tauri::command]
fn session_anchors_load(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<session::SessionAnchorRecord>, String> {
    state.session_db.load_session_anchors(&project_id)
}

#[tauri::command]
fn session_anchor_delete(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.session_db.delete_session_anchor(&id)
}

#[tauri::command]
fn session_anchors_clear(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    state.session_db.delete_project_anchors(&project_id)
}

#[tauri::command]
fn session_anchor_update_type(
    state: State<'_, AppState>,
    id: String,
    anchor_type: String,
) -> Result<(), String> {
    state.session_db.update_anchor_type(&id, &anchor_type)
}

// --- File browser commands (Files tab) ---

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    /// File extension (lowercase, without dot), empty for dirs
    ext: String,
}

#[tauri::command]
fn list_directory_children(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }
    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {e}"))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {e}"))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // Skip hidden files/dirs
        if name.starts_with('.') {
            continue;
        }
        let is_dir = metadata.is_dir();
        let ext = if is_dir {
            String::new()
        } else {
            std::path::Path::new(&name)
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        };
        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
            size: metadata.len(),
            ext,
        });
    }
    // Sort: dirs first, then files, alphabetical within each group
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Content types for file viewer routing
#[derive(serde::Serialize)]
#[serde(tag = "type")]
enum FileContent {
    Text { content: String, lang: String },
    Binary { message: String },
    TooLarge { size: u64 },
}

#[tauri::command]
fn read_file_content(path: String) -> Result<FileContent, String> {
    let file_path = std::path::Path::new(&path);
    if !file_path.is_file() {
        return Err(format!("Not a file: {path}"));
    }
    let metadata = std::fs::metadata(&path).map_err(|e| format!("Failed to read metadata: {e}"))?;
    let size = metadata.len();

    // Gate: files over 10MB
    if size > 10 * 1024 * 1024 {
        return Ok(FileContent::TooLarge { size });
    }

    let ext = file_path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    // Binary file types — return message, frontend handles display
    let binary_exts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp",
                       "pdf", "zip", "tar", "gz", "7z", "rar",
                       "mp3", "mp4", "wav", "ogg", "webm", "avi",
                       "woff", "woff2", "ttf", "otf", "eot",
                       "exe", "dll", "so", "dylib", "wasm"];
    if binary_exts.contains(&ext.as_str()) {
        return Ok(FileContent::Binary { message: format!("Binary file ({ext}), {size} bytes") });
    }

    // Text files — read content with language hint
    let content = std::fs::read_to_string(&path)
        .map_err(|_| format!("Binary or non-UTF-8 file"))?;

    let lang = match ext.as_str() {
        "rs" => "rust",
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "py" => "python",
        "svelte" => "svelte",
        "html" | "htm" => "html",
        "css" | "scss" | "less" => "css",
        "json" => "json",
        "toml" => "toml",
        "yaml" | "yml" => "yaml",
        "md" | "markdown" => "markdown",
        "sh" | "bash" | "zsh" => "bash",
        "sql" => "sql",
        "xml" => "xml",
        "csv" => "csv",
        "dockerfile" => "dockerfile",
        "lock" => "text",
        _ => "text",
    }.to_string();

    Ok(FileContent::Text { content, lang })
}

// --- Write file ---

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    let file_path = std::path::Path::new(&path);
    // Safety: only write to existing files (no arbitrary path creation)
    if !file_path.is_file() {
        return Err(format!("Not an existing file: {path}"));
    }
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("Failed to write file: {e}"))
}

// Directory picker: custom rfd command with parent window for modal behavior on Linux
#[tauri::command]
async fn pick_directory(window: tauri::Window) -> Result<Option<String>, String> {
    let dialog = rfd::AsyncFileDialog::new()
        .set_title("Select Directory")
        .set_parent(&window);
    let folder = dialog.pick_folder().await;
    Ok(folder.map(|f| f.path().to_string_lossy().into_owned()))
}

// --- CLI argument commands ---

#[tauri::command]
fn cli_get_group() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--group" {
            if i + 1 < args.len() {
                return Some(args[i + 1].clone());
            }
        } else if let Some(val) = args[i].strip_prefix("--group=") {
            return Some(val.to_string());
        }
        i += 1;
    }
    None
}

// --- Frontend telemetry bridge ---

#[tauri::command]
fn frontend_log(level: String, message: String, context: Option<serde_json::Value>) {
    match level.as_str() {
        "error" => tracing::error!(source = "frontend", ?context, "{message}"),
        "warn" => tracing::warn!(source = "frontend", ?context, "{message}"),
        "info" => tracing::info!(source = "frontend", ?context, "{message}"),
        "debug" => tracing::debug!(source = "frontend", ?context, "{message}"),
        _ => tracing::trace!(source = "frontend", ?context, "{message}"),
    }
}

// --- Remote machine commands ---

#[tauri::command]
async fn remote_list(state: State<'_, AppState>) -> Result<Vec<remote::RemoteMachineInfo>, String> {
    Ok(state.remote_manager.list_machines().await)
}

#[tauri::command]
async fn remote_add(state: State<'_, AppState>, config: RemoteMachineConfig) -> Result<String, String> {
    Ok(state.remote_manager.add_machine(config).await)
}

#[tauri::command]
async fn remote_remove(state: State<'_, AppState>, machine_id: String) -> Result<(), String> {
    state.remote_manager.remove_machine(&machine_id).await
}

#[tauri::command]
#[tracing::instrument(skip(app, state))]
async fn remote_connect(app: tauri::AppHandle, state: State<'_, AppState>, machine_id: String) -> Result<(), String> {
    state.remote_manager.connect(&app, &machine_id).await
}

#[tauri::command]
#[tracing::instrument(skip(state))]
async fn remote_disconnect(state: State<'_, AppState>, machine_id: String) -> Result<(), String> {
    state.remote_manager.disconnect(&machine_id).await
}

#[tauri::command]
#[tracing::instrument(skip(state, options), fields(session_id = %options.session_id))]
async fn remote_agent_query(state: State<'_, AppState>, machine_id: String, options: AgentQueryOptions) -> Result<(), String> {
    state.remote_manager.agent_query(&machine_id, &options).await
}

#[tauri::command]
#[tracing::instrument(skip(state))]
async fn remote_agent_stop(state: State<'_, AppState>, machine_id: String, session_id: String) -> Result<(), String> {
    state.remote_manager.agent_stop(&machine_id, &session_id).await
}

#[tauri::command]
#[tracing::instrument(skip(state), fields(shell = ?options.shell))]
async fn remote_pty_spawn(state: State<'_, AppState>, machine_id: String, options: PtyOptions) -> Result<String, String> {
    state.remote_manager.pty_spawn(&machine_id, &options).await
}

#[tauri::command]
async fn remote_pty_write(state: State<'_, AppState>, machine_id: String, id: String, data: String) -> Result<(), String> {
    state.remote_manager.pty_write(&machine_id, &id, &data).await
}

#[tauri::command]
async fn remote_pty_resize(state: State<'_, AppState>, machine_id: String, id: String, cols: u16, rows: u16) -> Result<(), String> {
    state.remote_manager.pty_resize(&machine_id, &id, cols, rows).await
}

#[tauri::command]
async fn remote_pty_kill(state: State<'_, AppState>, machine_id: String, id: String) -> Result<(), String> {
    state.remote_manager.pty_kill(&machine_id, &id).await
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    // Only allow http/https URLs
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http/https URLs are allowed".into());
    }
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Force dark GTK theme for native dialogs (file chooser, etc.)
    std::env::set_var("GTK_THEME", "Adwaita:dark");

    // Initialize tracing + optional OTLP export (before any tracing macros)
    let telemetry_guard = telemetry::init();

    tauri::Builder::default()
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
            fs_watch_project,
            fs_unwatch_project,
            fs_watcher_status,
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
            ctx_init_db,
            ctx_register_project,
            ctx_get_context,
            ctx_get_shared,
            ctx_get_summaries,
            ctx_search,
            memora_available,
            memora_list,
            memora_search,
            memora_get,
            remote_list,
            remote_add,
            remote_remove,
            remote_connect,
            remote_disconnect,
            remote_agent_query,
            remote_agent_stop,
            remote_pty_spawn,
            remote_pty_write,
            remote_pty_resize,
            remote_pty_kill,
            claude_list_profiles,
            claude_list_skills,
            claude_read_skill,
            groups_load,
            groups_save,
            discover_markdown_files,
            list_directory_children,
            read_file_content,
            write_file_content,
            agent_messages_save,
            agent_messages_load,
            project_agent_state_save,
            project_agent_state_load,
            session_metric_save,
            session_metrics_load,
            session_anchors_save,
            session_anchors_load,
            session_anchor_delete,
            session_anchors_clear,
            session_anchor_update_type,
            cli_get_group,
            pick_directory,
            open_url,
            frontend_log,
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            // Note: tauri-plugin-log is NOT initialized here because telemetry::init()
            // already sets up tracing-subscriber (which bridges the `log` crate via
            // tracing's compatibility layer). Adding plugin-log would panic with
            // "attempted to set a logger after the logging system was already initialized".

            // Create TauriEventSink for core managers
            let sink: Arc<dyn bterminal_core::event::EventSink> =
                Arc::new(TauriEventSink(app.handle().clone()));

            // Build sidecar config from Tauri paths
            let resource_dir = app
                .handle()
                .path()
                .resource_dir()
                .unwrap_or_else(|e| {
                    log::warn!("Failed to resolve resource_dir: {e}");
                    std::path::PathBuf::new()
                });
            let dev_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap()
                .to_path_buf();
            let sidecar_config = SidecarConfig {
                search_paths: vec![
                    resource_dir.join("sidecar"),
                    dev_root.join("sidecar"),
                ],
            };

            let pty_manager = Arc::new(PtyManager::new(sink.clone()));
            let sidecar_manager = Arc::new(SidecarManager::new(sink, sidecar_config));

            // Initialize session database
            let data_dir = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("bterminal");
            let session_db = Arc::new(
                SessionDb::open(&data_dir).expect("Failed to open session database"),
            );

            let file_watcher = Arc::new(FileWatcherManager::new());
            let fs_watcher = Arc::new(ProjectFsWatcher::new());
            let ctx_db = Arc::new(CtxDb::new());
            let memora_db = Arc::new(memora::MemoraDb::new());
            let remote_manager = Arc::new(RemoteManager::new());

            // Start local sidecar
            match sidecar_manager.start() {
                Ok(()) => log::info!("Sidecar startup initiated"),
                Err(e) => log::warn!("Sidecar startup failed (agent features unavailable): {e}"),
            }

            app.manage(AppState {
                pty_manager,
                sidecar_manager,
                session_db,
                file_watcher,
                fs_watcher,
                ctx_db,
                memora_db,
                remote_manager,
                _telemetry: telemetry_guard,
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
