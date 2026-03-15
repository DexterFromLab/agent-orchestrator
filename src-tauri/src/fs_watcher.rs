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

/// Status of inotify watch capacity
#[derive(Clone, Serialize)]
pub struct FsWatcherStatus {
    /// Kernel limit from /proc/sys/fs/inotify/max_user_watches
    pub max_watches: u64,
    /// Estimated directories being watched across all projects
    pub estimated_watches: u64,
    /// Usage ratio (0.0 - 1.0)
    pub usage_ratio: f64,
    /// Number of actively watched projects
    pub active_projects: usize,
    /// Warning message if approaching limit, null otherwise
    pub warning: Option<String>,
}

struct ProjectWatch {
    _watcher: RecommendedWatcher,
    _cwd: String,
    /// Estimated number of directories (inotify watches) for this project
    dir_count: u64,
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
        // In test mode, skip inotify watchers to avoid resource contention and flaky events
        if std::env::var("BTERMINAL_TEST").map_or(false, |v| v == "1") {
            log::info!("Test mode: skipping fs watcher for project {project_id}");
            return Ok(());
        }

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

        let dir_count = count_watched_dirs(cwd_path);
        log::info!("Started fs watcher for project {project_id} at {cwd} (~{dir_count} directories)");

        watches.insert(
            project_id.to_string(),
            ProjectWatch {
                _watcher: watcher,
                _cwd: cwd_owned,
                dir_count,
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

    /// Get current watcher status including inotify limit check
    pub fn status(&self) -> FsWatcherStatus {
        let max_watches = read_inotify_max_watches();
        let watches = self.watches.lock().unwrap();
        let active_projects = watches.len();
        let estimated_watches: u64 = watches.values().map(|w| w.dir_count).sum();
        let usage_ratio = if max_watches > 0 {
            estimated_watches as f64 / max_watches as f64
        } else {
            0.0
        };

        let warning = if usage_ratio > 0.90 {
            Some(format!(
                "inotify watch limit critical: using ~{estimated_watches}/{max_watches} watches ({:.0}%). \
                 Increase with: echo {} | sudo tee /proc/sys/fs/inotify/max_user_watches",
                usage_ratio * 100.0,
                max_watches * 2
            ))
        } else if usage_ratio > 0.75 {
            Some(format!(
                "inotify watch limit warning: using ~{estimated_watches}/{max_watches} watches ({:.0}%). \
                 Consider increasing with: echo {} | sudo tee /proc/sys/fs/inotify/max_user_watches",
                usage_ratio * 100.0,
                max_watches * 2
            ))
        } else {
            None
        };

        FsWatcherStatus {
            max_watches,
            estimated_watches,
            usage_ratio,
            active_projects,
            warning,
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

/// Read the kernel inotify watch limit from /proc/sys/fs/inotify/max_user_watches.
/// Returns 0 on non-Linux or if the file can't be read.
fn read_inotify_max_watches() -> u64 {
    std::fs::read_to_string("/proc/sys/fs/inotify/max_user_watches")
        .ok()
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0)
}

/// Count directories under a path that would become inotify watches.
/// Skips ignored directories. Caps the walk at 30,000 to avoid blocking on huge monorepos.
fn count_watched_dirs(root: &Path) -> u64 {
    const MAX_WALK: u64 = 30_000;
    let mut count: u64 = 1; // root itself

    fn walk_dir(dir: &Path, count: &mut u64, max: u64) {
        if *count >= max {
            return;
        }
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            if *count >= max {
                return;
            }
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if IGNORED_DIRS.contains(&name_str.as_ref()) {
                continue;
            }
            *count += 1;
            walk_dir(&path, count, max);
        }
    }

    walk_dir(root, &mut count, MAX_WALK);
    count
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

    #[test]
    fn test_read_inotify_max_watches() {
        // On Linux this should return a positive number
        let max = read_inotify_max_watches();
        if cfg!(target_os = "linux") {
            assert!(max > 0, "Expected positive inotify limit on Linux, got {max}");
        }
    }

    #[test]
    fn test_count_watched_dirs_tempdir() {
        let tmp = std::env::temp_dir().join("bterminal_test_count_dirs");
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("src/lib")).unwrap();
        std::fs::create_dir_all(tmp.join("node_modules/pkg")).unwrap(); // should be skipped
        std::fs::create_dir_all(tmp.join(".git/objects")).unwrap(); // should be skipped

        let count = count_watched_dirs(&tmp);
        // root + src + src/lib = 3 (node_modules and .git skipped)
        assert_eq!(count, 3, "Expected 3 watched dirs, got {count}");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_watcher_status_no_projects() {
        let watcher = ProjectFsWatcher::new();
        let status = watcher.status();
        assert_eq!(status.active_projects, 0);
        assert_eq!(status.estimated_watches, 0);
        assert!(status.warning.is_none());
    }
}
