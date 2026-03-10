// Filesystem write detection for project directories
// Uses notify crate (inotify on Linux) to detect file modifications.
// Emits Tauri events so frontend can detect external writes vs agent-managed writes.

use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Emitter;

/// Payload emitted on fs-write-detected events
#[derive(Clone, Serialize)]
pub struct FsWritePayload {
    pub project_id: String,
    pub file_path: String,
    pub timestamp_ms: u64,
}

/// Directories to skip when watching recursively
const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    ".svelte-kit",
    "dist",
    "__pycache__",
    ".next",
    ".nuxt",
    ".cache",
    "build",
];

struct ProjectWatch {
    _watcher: RecommendedWatcher,
    _cwd: String,
}

pub struct ProjectFsWatcher {
    watches: Mutex<HashMap<String, ProjectWatch>>,
}

impl ProjectFsWatcher {
    pub fn new() -> Self {
        Self {
            watches: Mutex::new(HashMap::new()),
        }
    }

    /// Start watching a project's CWD for file writes (Create, Modify, Rename).
    /// Debounces events per-file (100ms) to avoid flooding on rapid writes.
    pub fn watch_project(
        &self,
        app: &tauri::AppHandle,
        project_id: &str,
        cwd: &str,
    ) -> Result<(), String> {
        let cwd_path = Path::new(cwd);
        if !cwd_path.is_dir() {
            return Err(format!("Not a directory: {cwd}"));
        }

        let mut watches = self.watches.lock().unwrap();

        // Don't duplicate — unwatch first if already watching
        if watches.contains_key(project_id) {
            drop(watches);
            self.unwatch_project(project_id);
            watches = self.watches.lock().unwrap();
        }

        let app_handle = app.clone();
        let project_id_owned = project_id.to_string();
        let cwd_owned = cwd.to_string();

        // Per-file debounce state
        let debounce: std::sync::Arc<Mutex<HashMap<String, Instant>>> =
            std::sync::Arc::new(Mutex::new(HashMap::new()));
        let debounce_duration = Duration::from_millis(100);

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                let event = match res {
                    Ok(e) => e,
                    Err(_) => return,
                };

                // Only care about file writes (create, modify, rename-to)
                let is_write = matches!(
                    event.kind,
                    EventKind::Create(_) | EventKind::Modify(_)
                );
                if !is_write {
                    return;
                }

                for path in &event.paths {
                    // Skip directories
                    if path.is_dir() {
                        continue;
                    }

                    let path_str = path.to_string_lossy().to_string();

                    // Skip ignored directories
                    if should_ignore_path(&path_str) {
                        continue;
                    }

                    // Debounce: skip if same file was emitted within debounce window
                    let now = Instant::now();
                    let mut db = debounce.lock().unwrap();
                    if let Some(last) = db.get(&path_str) {
                        if now.duration_since(*last) < debounce_duration {
                            continue;
                        }
                    }
                    db.insert(path_str.clone(), now);
                    // Prune old debounce entries (keep map from growing unbounded)
                    if db.len() > 1000 {
                        let max_age = debounce_duration * 10;
                        db.retain(|_, v| now.duration_since(*v) < max_age);
                    }
                    drop(db);

                    let timestamp_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let _ = app_handle.emit(
                        "fs-write-detected",
                        FsWritePayload {
                            project_id: project_id_owned.clone(),
                            file_path: path_str,
                            timestamp_ms,
                        },
                    );
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create fs watcher: {e}"))?;

        watcher
            .watch(cwd_path, RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch directory: {e}"))?;

        log::info!("Started fs watcher for project {project_id} at {cwd}");

        watches.insert(
            project_id.to_string(),
            ProjectWatch {
                _watcher: watcher,
                _cwd: cwd_owned,
            },
        );

        Ok(())
    }

    /// Stop watching a project's CWD
    pub fn unwatch_project(&self, project_id: &str) {
        let mut watches = self.watches.lock().unwrap();
        if watches.remove(project_id).is_some() {
            log::info!("Stopped fs watcher for project {project_id}");
        }
    }

}

/// Check if a path contains any ignored directory component
fn should_ignore_path(path: &str) -> bool {
    for component in Path::new(path).components() {
        if let std::path::Component::Normal(name) = component {
            let name_str = name.to_string_lossy();
            if IGNORED_DIRS.contains(&name_str.as_ref()) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_ignore_git() {
        assert!(should_ignore_path("/home/user/project/.git/objects/abc"));
        assert!(should_ignore_path("/home/user/project/.git/HEAD"));
    }

    #[test]
    fn test_should_ignore_node_modules() {
        assert!(should_ignore_path("/project/node_modules/pkg/index.js"));
    }

    #[test]
    fn test_should_ignore_target() {
        assert!(should_ignore_path("/project/target/debug/build/foo"));
    }

    #[test]
    fn test_should_not_ignore_src() {
        assert!(!should_ignore_path("/project/src/main.rs"));
        assert!(!should_ignore_path("/project/src/lib/stores/health.svelte.ts"));
    }

    #[test]
    fn test_should_not_ignore_root_file() {
        assert!(!should_ignore_path("/project/Cargo.toml"));
    }
}
