// File watcher for markdown viewer
// Uses notify crate to watch files and emit Tauri events on change

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Emitter;

#[derive(Clone, Serialize)]
struct FileChangedPayload {
    pane_id: String,
    path: String,
    content: String,
}

struct WatchEntry {
    _watcher: RecommendedWatcher,
    _path: PathBuf,
}

pub struct FileWatcherManager {
    watchers: Mutex<HashMap<String, WatchEntry>>,
}

impl FileWatcherManager {
    pub fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
        }
    }

    pub fn watch(
        &self,
        app: &tauri::AppHandle,
        pane_id: &str,
        path: &str,
    ) -> Result<String, String> {
        // In test mode, skip file watching to avoid inotify noise and flaky events
        if std::env::var("BTERMINAL_TEST").map_or(false, |v| v == "1") {
            return std::fs::read_to_string(path)
                .map_err(|e| format!("Failed to read file: {e}"));
        }

        let file_path = PathBuf::from(path);
        if !file_path.exists() {
            return Err(format!("File not found: {path}"));
        }

        // Read initial content
        let content = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read file: {e}"))?;

        // Set up watcher
        let app_handle = app.clone();
        let pane_id_owned = pane_id.to_string();
        let watch_path = file_path.clone();

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    if event.kind.is_modify() {
                        if let Ok(new_content) = std::fs::read_to_string(&watch_path) {
                            let _ = app_handle.emit(
                                "file-changed",
                                FileChangedPayload {
                                    pane_id: pane_id_owned.clone(),
                                    path: watch_path.to_string_lossy().to_string(),
                                    content: new_content,
                                },
                            );
                        }
                    }
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create watcher: {e}"))?;

        let watch_dir = file_path.parent()
            .ok_or_else(|| format!("Cannot watch root-level path: {path}"))?;
        watcher
            .watch(watch_dir, RecursiveMode::NonRecursive)
            .map_err(|e| format!("Failed to watch path: {e}"))?;

        let mut watchers = self.watchers.lock().unwrap();
        watchers.insert(pane_id.to_string(), WatchEntry {
            _watcher: watcher,
            _path: file_path,
        });

        Ok(content)
    }

    pub fn unwatch(&self, pane_id: &str) {
        let mut watchers = self.watchers.lock().unwrap();
        watchers.remove(pane_id);
    }

    pub fn read_file(&self, path: &str) -> Result<String, String> {
        std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read file: {e}"))
    }
}
