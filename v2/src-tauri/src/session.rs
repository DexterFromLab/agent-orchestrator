// Session persistence via rusqlite
// Stores sessions, layout preferences, and last-used state

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshSession {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub key_file: String,
    pub folder: String,
    pub color: String,
    pub created_at: i64,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    #[serde(rename = "type")]
    pub session_type: String,
    pub title: String,
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub args: Option<Vec<String>>,
    pub created_at: i64,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutState {
    pub preset: String,
    pub pane_ids: Vec<String>,
}

pub struct SessionDb {
    conn: Mutex<Connection>,
}

impl SessionDb {
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir)
            .map_err(|e| format!("Failed to create data dir: {e}"))?;

        let db_path = data_dir.join("sessions.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {e}"))?;

        // Enable WAL mode for better concurrent read performance
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| format!("Failed to set pragmas: {e}"))?;

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
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| format!("Settings query failed: {e}"))?;
        let result = stmt.query_row(params![key], |row| row.get(0));
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Settings read failed: {e}")),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|e| format!("Settings write failed: {e}"))?;
        Ok(())
    }

    pub fn get_all_settings(&self) -> Result<Vec<(String, String)>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings ORDER BY key")
            .map_err(|e| format!("Settings query failed: {e}"))?;
        let settings = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("Settings query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Settings read failed: {e}"))?;
        Ok(settings)
    }

    pub fn list_sessions(&self) -> Result<Vec<Session>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, type, title, shell, cwd, args, created_at, last_used_at FROM sessions ORDER BY last_used_at DESC")
            .map_err(|e| format!("Query prepare failed: {e}"))?;

        let sessions = stmt
            .query_map([], |row| {
                let args_json: Option<String> = row.get(5)?;
                let args: Option<Vec<String>> = args_json.and_then(|j| serde_json::from_str(&j).ok());
                Ok(Session {
                    id: row.get(0)?,
                    session_type: row.get(1)?,
                    title: row.get(2)?,
                    shell: row.get(3)?,
                    cwd: row.get(4)?,
                    args,
                    created_at: row.get(6)?,
                    last_used_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Row read failed: {e}"))?;

        Ok(sessions)
    }

    pub fn save_session(&self, session: &Session) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let args_json = session.args.as_ref().map(|a| serde_json::to_string(a).unwrap_or_default());
        conn.execute(
            "INSERT OR REPLACE INTO sessions (id, type, title, shell, cwd, args, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                session.id,
                session.session_type,
                session.title,
                session.shell,
                session.cwd,
                args_json,
                session.created_at,
                session.last_used_at,
            ],
        ).map_err(|e| format!("Insert failed: {e}"))?;
        Ok(())
    }

    pub fn delete_session(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])
            .map_err(|e| format!("Delete failed: {e}"))?;
        Ok(())
    }

    pub fn update_title(&self, id: &str, title: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET title = ?1 WHERE id = ?2",
            params![title, id],
        ).map_err(|e| format!("Update failed: {e}"))?;
        Ok(())
    }

    pub fn touch_session(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        conn.execute(
            "UPDATE sessions SET last_used_at = ?1 WHERE id = ?2",
            params![now, id],
        ).map_err(|e| format!("Touch failed: {e}"))?;
        Ok(())
    }

    pub fn save_layout(&self, layout: &LayoutState) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let pane_ids_json = serde_json::to_string(&layout.pane_ids).unwrap_or_default();
        conn.execute(
            "UPDATE layout_state SET preset = ?1, pane_ids = ?2 WHERE id = 1",
            params![layout.preset, pane_ids_json],
        ).map_err(|e| format!("Layout save failed: {e}"))?;
        Ok(())
    }

    pub fn load_layout(&self) -> Result<LayoutState, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT preset, pane_ids FROM layout_state WHERE id = 1")
            .map_err(|e| format!("Layout query failed: {e}"))?;

        stmt.query_row([], |row| {
            let preset: String = row.get(0)?;
            let pane_ids_json: String = row.get(1)?;
            let pane_ids: Vec<String> = serde_json::from_str(&pane_ids_json).unwrap_or_default();
            Ok(LayoutState { preset, pane_ids })
        }).map_err(|e| format!("Layout read failed: {e}"))
    }

    // --- SSH session methods ---

    pub fn list_ssh_sessions(&self) -> Result<Vec<SshSession>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT id, name, host, port, username, key_file, folder, color, created_at, last_used_at FROM ssh_sessions ORDER BY last_used_at DESC")
            .map_err(|e| format!("SSH query prepare failed: {e}"))?;

        let sessions = stmt
            .query_map([], |row| {
                Ok(SshSession {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    host: row.get(2)?,
                    port: row.get(3)?,
                    username: row.get(4)?,
                    key_file: row.get(5)?,
                    folder: row.get(6)?,
                    color: row.get(7)?,
                    created_at: row.get(8)?,
                    last_used_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("SSH query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("SSH row read failed: {e}"))?;

        Ok(sessions)
    }

    pub fn save_ssh_session(&self, session: &SshSession) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO ssh_sessions (id, name, host, port, username, key_file, folder, color, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                session.id,
                session.name,
                session.host,
                session.port,
                session.username,
                session.key_file,
                session.folder,
                session.color,
                session.created_at,
                session.last_used_at,
            ],
        ).map_err(|e| format!("SSH insert failed: {e}"))?;
        Ok(())
    }

    pub fn delete_ssh_session(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM ssh_sessions WHERE id = ?1", params![id])
            .map_err(|e| format!("SSH delete failed: {e}"))?;
        Ok(())
    }

    pub fn update_ssh_session(&self, session: &SshSession) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE ssh_sessions SET name = ?1, host = ?2, port = ?3, username = ?4, key_file = ?5, folder = ?6, color = ?7, last_used_at = ?8 WHERE id = ?9",
            params![
                session.name,
                session.host,
                session.port,
                session.username,
                session.key_file,
                session.folder,
                session.color,
                session.last_used_at,
                session.id,
            ],
        ).map_err(|e| format!("SSH update failed: {e}"))?;
        Ok(())
    }
}
