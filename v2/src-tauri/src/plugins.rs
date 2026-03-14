// Plugin discovery and file reading.
// Scans ~/.config/bterminal/plugins/ for plugin.json manifest files.
// Each plugin lives in its own subdirectory with a plugin.json manifest.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Plugin manifest — parsed from plugin.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMeta {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    /// Entry JS file relative to plugin directory
    pub main: String,
    /// Permission strings: "palette", "btmsg:read", "bttask:read", "events"
    #[serde(default)]
    pub permissions: Vec<String>,
}

const VALID_PERMISSIONS: &[&str] = &["palette", "btmsg:read", "bttask:read", "events"];

/// Validate plugin ID: alphanumeric + hyphens only, 1-64 chars
fn is_valid_plugin_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// Discover all plugins in the given plugins directory.
/// Each plugin must have a plugin.json manifest file.
pub fn discover_plugins(plugins_dir: &Path) -> Vec<PluginMeta> {
    let mut plugins = Vec::new();

    let entries = match std::fs::read_dir(plugins_dir) {
        Ok(e) => e,
        Err(_) => return plugins,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join("plugin.json");
        if !manifest_path.exists() {
            continue;
        }

        let content = match std::fs::read_to_string(&manifest_path) {
            Ok(c) => c,
            Err(e) => {
                log::warn!(
                    "Failed to read plugin manifest {}: {e}",
                    manifest_path.display()
                );
                continue;
            }
        };

        let meta: PluginMeta = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(e) => {
                log::warn!(
                    "Invalid plugin manifest {}: {e}",
                    manifest_path.display()
                );
                continue;
            }
        };

        // Validate plugin ID
        if !is_valid_plugin_id(&meta.id) {
            log::warn!(
                "Plugin at {} has invalid ID '{}' — skipping",
                path.display(),
                meta.id
            );
            continue;
        }

        // Validate permissions
        for perm in &meta.permissions {
            if !VALID_PERMISSIONS.contains(&perm.as_str()) {
                log::warn!(
                    "Plugin '{}' requests unknown permission '{}' — skipping",
                    meta.id,
                    perm
                );
                continue;
            }
        }

        plugins.push(meta);
    }

    plugins
}

/// Read a file from a plugin directory, with path traversal prevention.
/// Only files within the plugin's own directory are accessible.
pub fn read_plugin_file(
    plugins_dir: &Path,
    plugin_id: &str,
    filename: &str,
) -> Result<String, String> {
    if !is_valid_plugin_id(plugin_id) {
        return Err("Invalid plugin ID".to_string());
    }

    let plugin_dir = plugins_dir.join(plugin_id);
    if !plugin_dir.is_dir() {
        return Err(format!("Plugin directory not found: {}", plugin_id));
    }

    // Canonicalize the plugin directory to resolve symlinks
    let canonical_plugin_dir = plugin_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve plugin directory: {e}"))?;

    let target = plugin_dir.join(filename);
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Failed to resolve file path: {e}"))?;

    // Path traversal prevention: target must be within plugin directory
    if !canonical_target.starts_with(&canonical_plugin_dir) {
        return Err("Access denied: path is outside plugin directory".to_string());
    }

    std::fs::read_to_string(&canonical_target)
        .map_err(|e| format!("Failed to read plugin file: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_valid_plugin_ids() {
        assert!(is_valid_plugin_id("my-plugin"));
        assert!(is_valid_plugin_id("hello123"));
        assert!(is_valid_plugin_id("a"));
        assert!(!is_valid_plugin_id(""));
        assert!(!is_valid_plugin_id("my_plugin")); // underscore not allowed
        assert!(!is_valid_plugin_id("my plugin")); // space not allowed
        assert!(!is_valid_plugin_id("../evil"));   // path traversal chars
        assert!(!is_valid_plugin_id(&"a".repeat(65))); // too long
    }

    #[test]
    fn test_discover_plugins_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let plugins = discover_plugins(dir.path());
        assert!(plugins.is_empty());
    }

    #[test]
    fn test_discover_plugins_nonexistent_dir() {
        let plugins = discover_plugins(Path::new("/nonexistent/path"));
        assert!(plugins.is_empty());
    }

    #[test]
    fn test_discover_plugins_valid_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let plugin_dir = dir.path().join("test-plugin");
        fs::create_dir(&plugin_dir).unwrap();
        fs::write(
            plugin_dir.join("plugin.json"),
            r#"{
                "id": "test-plugin",
                "name": "Test Plugin",
                "version": "1.0.0",
                "description": "A test plugin",
                "main": "index.js",
                "permissions": ["palette"]
            }"#,
        )
        .unwrap();
        fs::write(plugin_dir.join("index.js"), "// test").unwrap();

        let plugins = discover_plugins(dir.path());
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].id, "test-plugin");
        assert_eq!(plugins[0].name, "Test Plugin");
        assert_eq!(plugins[0].permissions, vec!["palette"]);
    }

    #[test]
    fn test_discover_plugins_invalid_id_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let plugin_dir = dir.path().join("bad_plugin");
        fs::create_dir(&plugin_dir).unwrap();
        fs::write(
            plugin_dir.join("plugin.json"),
            r#"{
                "id": "bad_plugin",
                "name": "Bad",
                "version": "1.0.0",
                "main": "index.js"
            }"#,
        )
        .unwrap();

        let plugins = discover_plugins(dir.path());
        assert!(plugins.is_empty());
    }

    #[test]
    fn test_read_plugin_file_success() {
        let dir = tempfile::tempdir().unwrap();
        let plugin_dir = dir.path().join("my-plugin");
        fs::create_dir(&plugin_dir).unwrap();
        fs::write(plugin_dir.join("index.js"), "console.log('hello');").unwrap();

        let result = read_plugin_file(dir.path(), "my-plugin", "index.js");
        assert_eq!(result.unwrap(), "console.log('hello');");
    }

    #[test]
    fn test_read_plugin_file_path_traversal_blocked() {
        let dir = tempfile::tempdir().unwrap();
        let plugin_dir = dir.path().join("my-plugin");
        fs::create_dir(&plugin_dir).unwrap();
        fs::write(plugin_dir.join("index.js"), "ok").unwrap();

        let result = read_plugin_file(dir.path(), "my-plugin", "../../../etc/passwd");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("outside plugin directory") || err.contains("Failed to resolve"));
    }

    #[test]
    fn test_read_plugin_file_invalid_id() {
        let dir = tempfile::tempdir().unwrap();
        let result = read_plugin_file(dir.path(), "../evil", "index.js");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid plugin ID"));
    }

    #[test]
    fn test_read_plugin_file_nonexistent_plugin() {
        let dir = tempfile::tempdir().unwrap();
        let result = read_plugin_file(dir.path(), "nonexistent", "index.js");
        assert!(result.is_err());
    }

}
