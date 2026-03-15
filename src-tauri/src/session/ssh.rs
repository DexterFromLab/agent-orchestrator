// SSH session persistence (ssh_sessions table)

use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::SessionDb;

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

impl SessionDb {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_db() -> SessionDb {
        let dir = tempfile::tempdir().unwrap();
        SessionDb::open(&dir.path().to_path_buf()).unwrap()
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
}
