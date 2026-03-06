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
    #[serde(default)]
    pub group_name: String,
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
            .prepare("SELECT id, type, title, shell, cwd, args, group_name, created_at, last_used_at FROM sessions ORDER BY last_used_at DESC")
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
                    group_name: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                    created_at: row.get(7)?,
                    last_used_at: row.get(8)?,
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
            "INSERT OR REPLACE INTO sessions (id, type, title, shell, cwd, args, group_name, created_at, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                session.id,
                session.session_type,
                session.title,
                session.shell,
                session.cwd,
                args_json,
                session.group_name,
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

    pub fn update_group(&self, id: &str, group_name: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET group_name = ?1 WHERE id = ?2",
            params![group_name, id],
        ).map_err(|e| format!("Update group failed: {e}"))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_db() -> SessionDb {
        let dir = tempfile::tempdir().unwrap();
        SessionDb::open(&dir.path().to_path_buf()).unwrap()
    }

    fn make_session(id: &str, title: &str) -> Session {
        Session {
            id: id.to_string(),
            session_type: "terminal".to_string(),
            title: title.to_string(),
            shell: Some("/bin/bash".to_string()),
            cwd: Some("/home/user".to_string()),
            args: Some(vec!["--login".to_string()]),
            group_name: String::new(),
            created_at: 1000,
            last_used_at: 2000,
        }
    }

    fn make_ssh_session(id: &str, name: &str) -> SshSession {
        SshSession {
            id: id.to_string(),
            name: name.to_string(),
            host: "example.com".to_string(),
            port: 22,
            username: "admin".to_string(),
            key_file: "/home/user/.ssh/id_rsa".to_string(),
            folder: "/srv".to_string(),
            color: "#89b4fa".to_string(),
            created_at: 1000,
            last_used_at: 2000,
        }
    }

    // --- Session CRUD ---

    #[test]
    fn test_list_sessions_empty() {
        let db = make_db();
        let sessions = db.list_sessions().unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn test_save_and_list_session() {
        let db = make_db();
        let s = make_session("s1", "My Terminal");
        db.save_session(&s).unwrap();

        let sessions = db.list_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "s1");
        assert_eq!(sessions[0].title, "My Terminal");
        assert_eq!(sessions[0].session_type, "terminal");
        assert_eq!(sessions[0].shell, Some("/bin/bash".to_string()));
        assert_eq!(sessions[0].cwd, Some("/home/user".to_string()));
        assert_eq!(sessions[0].args, Some(vec!["--login".to_string()]));
        assert_eq!(sessions[0].created_at, 1000);
        assert_eq!(sessions[0].last_used_at, 2000);
    }

    #[test]
    fn test_save_session_upsert() {
        let db = make_db();
        let mut s = make_session("s1", "First");
        db.save_session(&s).unwrap();

        s.title = "Updated".to_string();
        db.save_session(&s).unwrap();

        let sessions = db.list_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].title, "Updated");
    }

    #[test]
    fn test_delete_session() {
        let db = make_db();
        db.save_session(&make_session("s1", "A")).unwrap();
        db.save_session(&make_session("s2", "B")).unwrap();
        assert_eq!(db.list_sessions().unwrap().len(), 2);

        db.delete_session("s1").unwrap();
        let sessions = db.list_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "s2");
    }

    #[test]
    fn test_delete_nonexistent_session_no_error() {
        let db = make_db();
        // Should not error when deleting a session that doesn't exist
        db.delete_session("nonexistent").unwrap();
    }

    #[test]
    fn test_update_title() {
        let db = make_db();
        db.save_session(&make_session("s1", "Old")).unwrap();
        db.update_title("s1", "New Title").unwrap();

        let sessions = db.list_sessions().unwrap();
        assert_eq!(sessions[0].title, "New Title");
    }

    #[test]
    fn test_touch_session() {
        let db = make_db();
        db.save_session(&make_session("s1", "A")).unwrap();

        let before = db.list_sessions().unwrap()[0].last_used_at;
        db.touch_session("s1").unwrap();
        let after = db.list_sessions().unwrap()[0].last_used_at;

        // touch_session sets last_used_at to current time (epoch seconds),
        // which should be greater than our test fixture value of 2000
        assert!(after > before);
    }

    #[test]
    fn test_session_with_no_optional_fields() {
        let db = make_db();
        let s = Session {
            id: "s1".to_string(),
            session_type: "agent".to_string(),
            title: "Agent".to_string(),
            shell: None,
            cwd: None,
            args: None,
            group_name: String::new(),
            created_at: 1000,
            last_used_at: 2000,
        };
        db.save_session(&s).unwrap();

        let sessions = db.list_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert!(sessions[0].shell.is_none());
        assert!(sessions[0].cwd.is_none());
        assert!(sessions[0].args.is_none());
    }

    // --- Layout ---

    #[test]
    fn test_load_default_layout() {
        let db = make_db();
        let layout = db.load_layout().unwrap();
        assert_eq!(layout.preset, "1-col");
        assert!(layout.pane_ids.is_empty());
    }

    #[test]
    fn test_save_and_load_layout() {
        let db = make_db();
        let layout = LayoutState {
            preset: "2-col".to_string(),
            pane_ids: vec!["p1".to_string(), "p2".to_string()],
        };
        db.save_layout(&layout).unwrap();

        let loaded = db.load_layout().unwrap();
        assert_eq!(loaded.preset, "2-col");
        assert_eq!(loaded.pane_ids, vec!["p1", "p2"]);
    }

    #[test]
    fn test_save_layout_overwrites() {
        let db = make_db();
        let layout1 = LayoutState {
            preset: "2-col".to_string(),
            pane_ids: vec!["p1".to_string()],
        };
        db.save_layout(&layout1).unwrap();

        let layout2 = LayoutState {
            preset: "3-col".to_string(),
            pane_ids: vec!["a".to_string(), "b".to_string(), "c".to_string()],
        };
        db.save_layout(&layout2).unwrap();

        let loaded = db.load_layout().unwrap();
        assert_eq!(loaded.preset, "3-col");
        assert_eq!(loaded.pane_ids.len(), 3);
    }

    // --- Settings ---

    #[test]
    fn test_get_setting_missing_returns_none() {
        let db = make_db();
        let val = db.get_setting("nonexistent").unwrap();
        assert!(val.is_none());
    }

    #[test]
    fn test_set_and_get_setting() {
        let db = make_db();
        db.set_setting("theme", "mocha").unwrap();
        let val = db.get_setting("theme").unwrap();
        assert_eq!(val, Some("mocha".to_string()));
    }

    #[test]
    fn test_set_setting_overwrites() {
        let db = make_db();
        db.set_setting("font_size", "12").unwrap();
        db.set_setting("font_size", "14").unwrap();
        assert_eq!(db.get_setting("font_size").unwrap(), Some("14".to_string()));
    }

    #[test]
    fn test_get_all_settings() {
        let db = make_db();
        db.set_setting("b_key", "val_b").unwrap();
        db.set_setting("a_key", "val_a").unwrap();

        let all = db.get_all_settings().unwrap();
        assert_eq!(all.len(), 2);
        // Should be ordered by key
        assert_eq!(all[0].0, "a_key");
        assert_eq!(all[1].0, "b_key");
    }

    #[test]
    fn test_get_all_settings_empty() {
        let db = make_db();
        let all = db.get_all_settings().unwrap();
        assert!(all.is_empty());
    }

    // --- SSH Sessions ---

    #[test]
    fn test_list_ssh_sessions_empty() {
        let db = make_db();
        let sessions = db.list_ssh_sessions().unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn test_save_and_list_ssh_session() {
        let db = make_db();
        let s = make_ssh_session("ssh1", "Prod Server");
        db.save_ssh_session(&s).unwrap();

        let sessions = db.list_ssh_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "ssh1");
        assert_eq!(sessions[0].name, "Prod Server");
        assert_eq!(sessions[0].host, "example.com");
        assert_eq!(sessions[0].port, 22);
        assert_eq!(sessions[0].username, "admin");
    }

    #[test]
    fn test_delete_ssh_session() {
        let db = make_db();
        db.save_ssh_session(&make_ssh_session("ssh1", "A")).unwrap();
        db.save_ssh_session(&make_ssh_session("ssh2", "B")).unwrap();

        db.delete_ssh_session("ssh1").unwrap();
        let sessions = db.list_ssh_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "ssh2");
    }

    #[test]
    fn test_update_ssh_session() {
        let db = make_db();
        let mut s = make_ssh_session("ssh1", "Old Name");
        db.save_ssh_session(&s).unwrap();

        s.name = "New Name".to_string();
        s.host = "new.example.com".to_string();
        s.port = 2222;
        s.last_used_at = 9999;
        db.update_ssh_session(&s).unwrap();

        let sessions = db.list_ssh_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].name, "New Name");
        assert_eq!(sessions[0].host, "new.example.com");
        assert_eq!(sessions[0].port, 2222);
        assert_eq!(sessions[0].last_used_at, 9999);
        // created_at should be unchanged (UPDATE doesn't touch it)
        assert_eq!(sessions[0].created_at, 1000);
    }

    #[test]
    fn test_ssh_session_upsert() {
        let db = make_db();
        let mut s = make_ssh_session("ssh1", "First");
        db.save_ssh_session(&s).unwrap();

        s.name = "Second".to_string();
        db.save_ssh_session(&s).unwrap();

        let sessions = db.list_ssh_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].name, "Second");
    }

    // --- Multiple sessions ordering ---

    #[test]
    fn test_sessions_ordered_by_last_used_desc() {
        let db = make_db();
        let mut s1 = make_session("s1", "Older");
        s1.last_used_at = 1000;
        let mut s2 = make_session("s2", "Newer");
        s2.last_used_at = 3000;
        let mut s3 = make_session("s3", "Middle");
        s3.last_used_at = 2000;

        db.save_session(&s1).unwrap();
        db.save_session(&s2).unwrap();
        db.save_session(&s3).unwrap();

        let sessions = db.list_sessions().unwrap();
        assert_eq!(sessions[0].id, "s2");
        assert_eq!(sessions[1].id, "s3");
        assert_eq!(sessions[2].id, "s1");
    }
}
