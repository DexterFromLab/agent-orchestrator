// AppConfig — centralized path resolution for all BTerminal subsystems.
// In production, paths resolve via dirs:: crate defaults.
// In test mode (BTERMINAL_TEST=1), paths resolve from env var overrides:
//   BTERMINAL_TEST_DATA_DIR   → replaces dirs::data_dir()/bterminal
//   BTERMINAL_TEST_CONFIG_DIR → replaces dirs::config_dir()/bterminal
//   BTERMINAL_TEST_CTX_DIR    → replaces ~/.claude-context

use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppConfig {
    /// Data directory for btmsg.db, sessions.db (default: ~/.local/share/bterminal)
    pub data_dir: PathBuf,
    /// Config directory for groups.json (default: ~/.config/bterminal)
    pub config_dir: PathBuf,
    /// ctx database path (default: ~/.claude-context/context.db)
    pub ctx_db_path: PathBuf,
    /// Memora database path (default: ~/.local/share/memora/memories.db)
    pub memora_db_path: PathBuf,
    /// Whether we are in test mode
    pub test_mode: bool,
}

impl AppConfig {
    /// Build config from environment. In test mode, uses BTERMINAL_TEST_*_DIR env vars.
    pub fn from_env() -> Self {
        let test_mode = std::env::var("BTERMINAL_TEST").map_or(false, |v| v == "1");

        let data_dir = std::env::var("BTERMINAL_TEST_DATA_DIR")
            .ok()
            .filter(|_| test_mode)
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                dirs::data_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("bterminal")
            });

        let config_dir = std::env::var("BTERMINAL_TEST_CONFIG_DIR")
            .ok()
            .filter(|_| test_mode)
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                dirs::config_dir()
                    .unwrap_or_else(|| PathBuf::from("."))
                    .join("bterminal")
            });

        let ctx_db_path = std::env::var("BTERMINAL_TEST_CTX_DIR")
            .ok()
            .filter(|_| test_mode)
            .map(|d| PathBuf::from(d).join("context.db"))
            .unwrap_or_else(|| {
                dirs::home_dir()
                    .unwrap_or_default()
                    .join(".claude-context")
                    .join("context.db")
            });

        let memora_db_path = if test_mode {
            // In test mode, memora is optional — use data_dir/memora/memories.db
            data_dir.join("memora").join("memories.db")
        } else {
            dirs::data_dir()
                .unwrap_or_else(|| {
                    dirs::home_dir()
                        .unwrap_or_default()
                        .join(".local/share")
                })
                .join("memora")
                .join("memories.db")
        };

        Self {
            data_dir,
            config_dir,
            ctx_db_path,
            memora_db_path,
            test_mode,
        }
    }

    /// Path to btmsg.db (shared between btmsg and bttask)
    pub fn btmsg_db_path(&self) -> PathBuf {
        self.data_dir.join("btmsg.db")
    }

    /// Path to sessions.db
    pub fn sessions_db_dir(&self) -> &PathBuf {
        &self.data_dir
    }

    /// Path to groups.json
    pub fn groups_json_path(&self) -> PathBuf {
        self.config_dir.join("groups.json")
    }

    /// Path to plugins directory
    pub fn plugins_dir(&self) -> PathBuf {
        self.config_dir.join("plugins")
    }

    /// Whether running in test mode (BTERMINAL_TEST=1)
    pub fn is_test_mode(&self) -> bool {
        self.test_mode
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Serialize all tests that mutate env vars to prevent race conditions.
    // Rust runs tests in parallel; set_var/remove_var are process-global.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn test_production_paths_use_dirs() {
        let _lock = ENV_LOCK.lock().unwrap();
        // Without BTERMINAL_TEST=1, paths should use dirs:: defaults
        std::env::remove_var("BTERMINAL_TEST");
        std::env::remove_var("BTERMINAL_TEST_DATA_DIR");
        std::env::remove_var("BTERMINAL_TEST_CONFIG_DIR");
        std::env::remove_var("BTERMINAL_TEST_CTX_DIR");

        let config = AppConfig::from_env();
        assert!(!config.is_test_mode());
        // Should end with "bterminal" for data and config
        assert!(config.data_dir.ends_with("bterminal"));
        assert!(config.config_dir.ends_with("bterminal"));
        assert!(config.ctx_db_path.ends_with("context.db"));
        assert!(config.memora_db_path.ends_with("memories.db"));
    }

    #[test]
    fn test_btmsg_db_path() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::remove_var("BTERMINAL_TEST");
        let config = AppConfig::from_env();
        let path = config.btmsg_db_path();
        assert!(path.ends_with("btmsg.db"));
        assert!(path.parent().unwrap().ends_with("bterminal"));
    }

    #[test]
    fn test_groups_json_path() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::remove_var("BTERMINAL_TEST");
        let config = AppConfig::from_env();
        let path = config.groups_json_path();
        assert!(path.ends_with("groups.json"));
    }

    #[test]
    fn test_test_mode_uses_overrides() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("BTERMINAL_TEST", "1");
        std::env::set_var("BTERMINAL_TEST_DATA_DIR", "/tmp/bt-test-data");
        std::env::set_var("BTERMINAL_TEST_CONFIG_DIR", "/tmp/bt-test-config");
        std::env::set_var("BTERMINAL_TEST_CTX_DIR", "/tmp/bt-test-ctx");

        let config = AppConfig::from_env();
        assert!(config.is_test_mode());
        assert_eq!(config.data_dir, PathBuf::from("/tmp/bt-test-data"));
        assert_eq!(config.config_dir, PathBuf::from("/tmp/bt-test-config"));
        assert_eq!(config.ctx_db_path, PathBuf::from("/tmp/bt-test-ctx/context.db"));
        assert_eq!(config.btmsg_db_path(), PathBuf::from("/tmp/bt-test-data/btmsg.db"));
        assert_eq!(config.groups_json_path(), PathBuf::from("/tmp/bt-test-config/groups.json"));

        // Cleanup
        std::env::remove_var("BTERMINAL_TEST");
        std::env::remove_var("BTERMINAL_TEST_DATA_DIR");
        std::env::remove_var("BTERMINAL_TEST_CONFIG_DIR");
        std::env::remove_var("BTERMINAL_TEST_CTX_DIR");
    }

    #[test]
    fn test_test_mode_without_overrides_uses_defaults() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("BTERMINAL_TEST", "1");
        std::env::remove_var("BTERMINAL_TEST_DATA_DIR");
        std::env::remove_var("BTERMINAL_TEST_CONFIG_DIR");
        std::env::remove_var("BTERMINAL_TEST_CTX_DIR");

        let config = AppConfig::from_env();
        assert!(config.is_test_mode());
        // Without override vars, falls back to dirs:: defaults
        assert!(config.data_dir.ends_with("bterminal"));

        std::env::remove_var("BTERMINAL_TEST");
    }

    #[test]
    fn test_test_mode_memora_in_data_dir() {
        let _lock = ENV_LOCK.lock().unwrap();
        std::env::set_var("BTERMINAL_TEST", "1");
        std::env::set_var("BTERMINAL_TEST_DATA_DIR", "/tmp/bt-test-data");

        let config = AppConfig::from_env();
        assert_eq!(
            config.memora_db_path,
            PathBuf::from("/tmp/bt-test-data/memora/memories.db")
        );

        std::env::remove_var("BTERMINAL_TEST");
        std::env::remove_var("BTERMINAL_TEST_DATA_DIR");
    }
}
