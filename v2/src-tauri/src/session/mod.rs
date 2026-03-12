// Session persistence via rusqlite
// SessionDb owns the connection; table-specific operations live in sub-modules

mod sessions;
mod layout;
mod settings;
mod ssh;
mod agents;
mod metrics;
mod anchors;

pub use sessions::Session;
pub use layout::LayoutState;
pub use ssh::SshSession;
pub use agents::{AgentMessageRecord, ProjectAgentState};
pub use metrics::SessionMetric;
pub use anchors::SessionAnchorRecord;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct SessionDb {
    pub(in crate::session) conn: Mutex<Connection>,
}

impl SessionDb {
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir)
            .map_err(|e| format!("Failed to create data dir: {e}"))?;

        let db_path = data_dir.join("sessions.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {e}"))?;

        // Enable WAL mode for better concurrent read performance
        // journal_mode returns a result row, so use query_row instead of pragma_update
        conn.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()))
            .map_err(|e| format!("Failed to set journal_mode: {e}"))?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| format!("Failed to set foreign_keys: {e}"))?;

        let db = Self { conn: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                shell TEXT,
                cwd TEXT,
                args TEXT,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS layout_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                preset TEXT NOT NULL DEFAULT '1-col',
                pane_ids TEXT NOT NULL DEFAULT '[]'
            );

            INSERT OR IGNORE INTO layout_state (id, preset, pane_ids) VALUES (1, '1-col', '[]');

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ssh_sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                key_file TEXT DEFAULT '',
                folder TEXT DEFAULT '',
                color TEXT DEFAULT '#89b4fa',
                created_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL
            );
            "
        ).map_err(|e| format!("Migration failed: {e}"))?;

        // Add group_name column if missing (v2 migration)
        let has_group: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='group_name'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        if has_group == 0 {
            conn.execute("ALTER TABLE sessions ADD COLUMN group_name TEXT DEFAULT ''", [])
                .map_err(|e| format!("Migration (group_name) failed: {e}"))?;
        }

        // v3 migration: project_id column on sessions
        let has_project_id: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('sessions') WHERE name='project_id'",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        if has_project_id == 0 {
            conn.execute("ALTER TABLE sessions ADD COLUMN project_id TEXT DEFAULT ''", [])
                .map_err(|e| format!("Migration (project_id) failed: {e}"))?;
        }

        // v3: agent message history for session continuity
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS agent_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                sdk_session_id TEXT,
                message_type TEXT NOT NULL,
                content TEXT NOT NULL,
                parent_id TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_agent_messages_session
                ON agent_messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_agent_messages_project
                ON agent_messages(project_id);

            CREATE TABLE IF NOT EXISTS project_agent_state (
                project_id TEXT PRIMARY KEY,
                last_session_id TEXT NOT NULL,
                sdk_session_id TEXT,
                status TEXT NOT NULL,
                cost_usd REAL DEFAULT 0,
                input_tokens INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                last_prompt TEXT,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS session_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                start_time INTEGER NOT NULL,
                end_time INTEGER NOT NULL,
                peak_tokens INTEGER DEFAULT 0,
                turn_count INTEGER DEFAULT 0,
                tool_call_count INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0,
                model TEXT,
                status TEXT NOT NULL,
                error_message TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_session_metrics_project
                ON session_metrics(project_id);

            CREATE TABLE IF NOT EXISTS session_anchors (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                anchor_type TEXT NOT NULL,
                content TEXT NOT NULL,
                estimated_tokens INTEGER NOT NULL,
                turn_index INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_session_anchors_project
                ON session_anchors(project_id);"
        ).map_err(|e| format!("Migration (v3 tables) failed: {e}"))?;

        Ok(())
    }
}
