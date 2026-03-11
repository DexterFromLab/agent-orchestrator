// Session CRUD operations (sessions table)

use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::SessionDb;

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

impl SessionDb {
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
