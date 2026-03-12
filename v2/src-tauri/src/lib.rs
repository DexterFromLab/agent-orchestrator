mod btmsg;
mod bttask;
mod commands;
mod ctx;
mod event_sink;
mod fs_watcher;
mod groups;
mod memora;
mod notifications;
mod plugins;
mod pty;
mod secrets;
mod remote;
mod search;
mod sidecar;
mod session;
mod telemetry;
mod watcher;

use bterminal_core::config::AppConfig;
use event_sink::TauriEventSink;
use pty::PtyManager;
use remote::RemoteManager;
use session::SessionDb;
use sidecar::{SidecarConfig, SidecarManager};
use fs_watcher::ProjectFsWatcher;
use watcher::FileWatcherManager;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Manager;

pub(crate) struct AppState {
    pub pty_manager: Arc<PtyManager>,
    pub sidecar_manager: Arc<SidecarManager>,
    pub session_db: Arc<SessionDb>,
    pub file_watcher: Arc<FileWatcherManager>,
    pub fs_watcher: Arc<ProjectFsWatcher>,
    pub ctx_db: Arc<ctx::CtxDb>,
    pub memora_db: Arc<memora::MemoraDb>,
    pub remote_manager: Arc<RemoteManager>,
    pub search_db: Arc<search::SearchDb>,
    pub app_config: Arc<AppConfig>,
    _telemetry: telemetry::TelemetryGuard,
}

/// Install btmsg/bttask CLI tools to ~/.local/bin/ so agent subprocesses can find them.
/// Sources: bundled resources (production) or repo root (development).
/// Only overwrites if the source is newer or the destination doesn't exist.
fn install_cli_tools(resource_dir: &Path, dev_root: &Path) {
    let bin_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".local")
        .join("bin");
    if let Err(e) = std::fs::create_dir_all(&bin_dir) {
        log::warn!("Failed to create ~/.local/bin: {e}");
        return;
    }

    for tool_name in &["btmsg", "bttask"] {
        // Try resource dir first (production bundle), then dev repo root
        let source = [
            resource_dir.join(tool_name),
            dev_root.join(tool_name),
        ]
        .into_iter()
        .find(|p| p.is_file());

        let source = match source {
            Some(p) => p,
            None => {
                log::warn!("CLI tool '{tool_name}' not found in resources or dev root");
                continue;
            }
        };

        let dest = bin_dir.join(tool_name);
        let should_install = if dest.exists() {
            // Compare modification times — install if source is newer
            match (source.metadata(), dest.metadata()) {
                (Ok(sm), Ok(dm)) => {
                    sm.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                        > dm.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                }
                _ => true,
            }
        } else {
            true
        };

        if should_install {
            match std::fs::copy(&source, &dest) {
                Ok(_) => {
                    // Ensure executable permission on Unix
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(&dest, std::fs::Permissions::from_mode(0o755));
                    }
                    log::info!("Installed {tool_name} to {}", dest.display());
                }
                Err(e) => log::warn!("Failed to install {tool_name}: {e}"),
            }
        }
    }
}

/// Run `PRAGMA wal_checkpoint(TRUNCATE)` on a SQLite database to reclaim WAL file space.
/// Returns Ok(()) on success or Err with a diagnostic message.
pub(crate) fn checkpoint_wal(path: &Path) -> Result<(), String> {
    use rusqlite::{Connection, OpenFlags};

    if !path.exists() {
        return Ok(()); // DB doesn't exist yet — nothing to checkpoint
    }

    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("WAL checkpoint: failed to open {}: {e}", path.display()))?;
    conn.query_row("PRAGMA busy_timeout = 5000", [], |_| Ok(()))
        .map_err(|e| format!("WAL checkpoint: failed to set busy_timeout: {e}"))?;
    conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |_| Ok(()))
        .map_err(|e| format!("WAL checkpoint failed on {}: {e}", path.display()))?;
    Ok(())
}

/// Spawn a background task that checkpoints WAL on both databases every 5 minutes.
fn spawn_wal_checkpoint_task(sessions_db_path: PathBuf, btmsg_db_path: PathBuf) {
    tokio::spawn(async move {
        let interval = std::time::Duration::from_secs(300);
        loop {
            tokio::time::sleep(interval).await;
            for (label, path) in [("sessions.db", &sessions_db_path), ("btmsg.db", &btmsg_db_path)] {
                match checkpoint_wal(path) {
                    Ok(()) => tracing::info!("WAL checkpoint completed for {label}"),
                    Err(e) => tracing::warn!("WAL checkpoint error for {label}: {e}"),
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Force dark GTK theme for native dialogs (file chooser, etc.)
    std::env::set_var("GTK_THEME", "Adwaita:dark");

    // Resolve all paths via AppConfig (respects BTERMINAL_TEST_* env vars)
    let app_config = AppConfig::from_env();
    if app_config.is_test_mode() {
        log::info!(
            "Test mode enabled: data_dir={}, config_dir={}",
            app_config.data_dir.display(),
            app_config.config_dir.display()
        );
    }

    // Initialize subsystem paths from AppConfig (before any db access)
    btmsg::init(app_config.btmsg_db_path());
    bttask::init(app_config.btmsg_db_path());
    groups::init(app_config.groups_json_path());

    // Initialize tracing + optional OTLP export (before any tracing macros)
    let telemetry_guard = telemetry::init();

    let app_config_arc = Arc::new(app_config);

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // PTY
            commands::pty::pty_spawn,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
            // Agent/sidecar
            commands::agent::agent_query,
            commands::agent::agent_stop,
            commands::agent::agent_ready,
            commands::agent::agent_restart,
            commands::agent::agent_set_sandbox,
            // File watcher
            commands::watcher::file_watch,
            commands::watcher::file_unwatch,
            commands::watcher::file_read,
            commands::watcher::fs_watch_project,
            commands::watcher::fs_unwatch_project,
            commands::watcher::fs_watcher_status,
            // Session/layout/settings/SSH
            commands::session::session_list,
            commands::session::session_save,
            commands::session::session_delete,
            commands::session::session_update_title,
            commands::session::session_touch,
            commands::session::session_update_group,
            commands::session::layout_save,
            commands::session::layout_load,
            commands::session::settings_get,
            commands::session::settings_set,
            commands::session::settings_list,
            commands::session::ssh_session_list,
            commands::session::ssh_session_save,
            commands::session::ssh_session_delete,
            // Agent persistence (messages, state, metrics, anchors)
            commands::persistence::agent_messages_save,
            commands::persistence::agent_messages_load,
            commands::persistence::project_agent_state_save,
            commands::persistence::project_agent_state_load,
            commands::persistence::session_metric_save,
            commands::persistence::session_metrics_load,
            commands::persistence::session_anchors_save,
            commands::persistence::session_anchors_load,
            commands::persistence::session_anchor_delete,
            commands::persistence::session_anchors_clear,
            commands::persistence::session_anchor_update_type,
            // ctx + Memora
            commands::knowledge::ctx_init_db,
            commands::knowledge::ctx_register_project,
            commands::knowledge::ctx_get_context,
            commands::knowledge::ctx_get_shared,
            commands::knowledge::ctx_get_summaries,
            commands::knowledge::ctx_search,
            commands::knowledge::memora_available,
            commands::knowledge::memora_list,
            commands::knowledge::memora_search,
            commands::knowledge::memora_get,
            // Claude profiles/skills
            commands::claude::claude_list_profiles,
            commands::claude::claude_list_skills,
            commands::claude::claude_read_skill,
            // Groups
            commands::groups::groups_load,
            commands::groups::groups_save,
            commands::groups::discover_markdown_files,
            // File browser
            commands::files::list_directory_children,
            commands::files::read_file_content,
            commands::files::write_file_content,
            commands::files::pick_directory,
            // Remote machines
            commands::remote::remote_list,
            commands::remote::remote_add,
            commands::remote::remote_remove,
            commands::remote::remote_connect,
            commands::remote::remote_disconnect,
            commands::remote::remote_agent_query,
            commands::remote::remote_agent_stop,
            commands::remote::remote_pty_spawn,
            commands::remote::remote_pty_write,
            commands::remote::remote_pty_resize,
            commands::remote::remote_pty_kill,
            // btmsg (agent messenger)
            commands::btmsg::btmsg_get_agents,
            commands::btmsg::btmsg_unread_count,
            commands::btmsg::btmsg_unread_messages,
            commands::btmsg::btmsg_history,
            commands::btmsg::btmsg_send,
            commands::btmsg::btmsg_set_status,
            commands::btmsg::btmsg_ensure_admin,
            commands::btmsg::btmsg_all_feed,
            commands::btmsg::btmsg_mark_read,
            commands::btmsg::btmsg_get_channels,
            commands::btmsg::btmsg_channel_messages,
            commands::btmsg::btmsg_channel_send,
            commands::btmsg::btmsg_create_channel,
            commands::btmsg::btmsg_add_channel_member,
            commands::btmsg::btmsg_register_agents,
            // btmsg health monitoring
            commands::btmsg::btmsg_record_heartbeat,
            commands::btmsg::btmsg_get_stale_agents,
            commands::btmsg::btmsg_get_dead_letters,
            commands::btmsg::btmsg_clear_dead_letters,
            // Audit log
            commands::btmsg::audit_log_event,
            commands::btmsg::audit_log_list,
            commands::btmsg::audit_log_for_agent,
            // bttask (task board)
            commands::bttask::bttask_list,
            commands::bttask::bttask_comments,
            commands::bttask::bttask_update_status,
            commands::bttask::bttask_add_comment,
            commands::bttask::bttask_create,
            commands::bttask::bttask_delete,
            commands::bttask::bttask_review_queue_count,
            // Search (FTS5)
            commands::search::search_init,
            commands::search::search_query,
            commands::search::search_rebuild,
            commands::search::search_index_message,
            // Notifications
            commands::notifications::notify_desktop,
            // Secrets (system keyring)
            commands::secrets::secrets_store,
            commands::secrets::secrets_get,
            commands::secrets::secrets_delete,
            commands::secrets::secrets_list,
            commands::secrets::secrets_has_keyring,
            commands::secrets::secrets_known_keys,
            // Plugins
            commands::plugins::plugins_discover,
            commands::plugins::plugin_read_file,
            // Misc
            commands::misc::cli_get_group,
            commands::misc::open_url,
            commands::misc::is_test_mode,
            commands::misc::frontend_log,
        ])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            // Note: tauri-plugin-log is NOT initialized here because telemetry::init()
            // already sets up tracing-subscriber (which bridges the `log` crate via
            // tracing's compatibility layer). Adding plugin-log would panic with
            // "attempted to set a logger after the logging system was already initialized".

            let config = app_config_arc.clone();

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
            // Install btmsg/bttask CLI tools to ~/.local/bin/
            if !config.is_test_mode() {
                install_cli_tools(&resource_dir, &dev_root);
            }

            // Forward test mode env vars to sidecar processes
            let mut env_overrides = std::collections::HashMap::new();
            if config.is_test_mode() {
                env_overrides.insert("BTERMINAL_TEST".into(), "1".into());
                if let Ok(v) = std::env::var("BTERMINAL_TEST_DATA_DIR") {
                    env_overrides.insert("BTERMINAL_TEST_DATA_DIR".into(), v);
                }
                if let Ok(v) = std::env::var("BTERMINAL_TEST_CONFIG_DIR") {
                    env_overrides.insert("BTERMINAL_TEST_CONFIG_DIR".into(), v);
                }
            }

            let sidecar_config = SidecarConfig {
                search_paths: vec![
                    resource_dir.join("sidecar"),
                    dev_root.join("sidecar"),
                ],
                env_overrides,
                sandbox: bterminal_core::sandbox::SandboxConfig::default(),
            };

            let pty_manager = Arc::new(PtyManager::new(sink.clone()));
            let sidecar_manager = Arc::new(SidecarManager::new(sink, sidecar_config));

            // Initialize session database using AppConfig data_dir
            let session_db = Arc::new(
                SessionDb::open(config.sessions_db_dir()).expect("Failed to open session database"),
            );

            let file_watcher = Arc::new(FileWatcherManager::new());
            let fs_watcher = Arc::new(ProjectFsWatcher::new());
            let ctx_db = Arc::new(ctx::CtxDb::new_with_path(config.ctx_db_path.clone()));
            let memora_db = Arc::new(memora::MemoraDb::new_with_path(config.memora_db_path.clone()));
            let remote_manager = Arc::new(RemoteManager::new());

            // Initialize FTS5 search database
            let search_db_path = config.data_dir.join("bterminal").join("search.db");
            let search_db = Arc::new(
                search::SearchDb::open(&search_db_path).expect("Failed to open search database"),
            );

            // Start local sidecar
            match sidecar_manager.start() {
                Ok(()) => log::info!("Sidecar startup initiated"),
                Err(e) => log::warn!("Sidecar startup failed (agent features unavailable): {e}"),
            }

            // Start periodic WAL checkpoint task (every 5 minutes)
            let sessions_db_path = config.data_dir.join("sessions.db");
            let btmsg_db_path = config.btmsg_db_path();
            spawn_wal_checkpoint_task(sessions_db_path, btmsg_db_path);

            app.manage(AppState {
                pty_manager,
                sidecar_manager,
                session_db,
                file_watcher,
                fs_watcher,
                ctx_db,
                memora_db,
                remote_manager,
                search_db,
                app_config: config,
                _telemetry: telemetry_guard,
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
