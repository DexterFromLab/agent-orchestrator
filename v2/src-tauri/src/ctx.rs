// ctx — Read-only access to the Claude Code context manager database
// Database: ~/.claude-context/context.db (managed by ctx CLI tool)

use rusqlite::{Connection, params};
use serde::Serialize;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct CtxProject {
    pub name: String,
    pub description: String,
    pub work_dir: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CtxEntry {
    pub project: String,
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CtxSummary {
    pub project: String,
    pub summary: String,
    pub created_at: String,
}

pub struct CtxDb {
    conn: Mutex<Option<Connection>>,
}

impl CtxDb {
    pub fn new() -> Self {
        let db_path = dirs::home_dir()
            .unwrap_or_default()
            .join(".claude-context")
            .join("context.db");

        let conn = if db_path.exists() {
            Connection::open_with_flags(
                &db_path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
            ).ok()
        } else {
            None
        };

        Self { conn: Mutex::new(conn) }
    }

    pub fn list_projects(&self) -> Result<Vec<CtxProject>, String> {
        let lock = self.conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("ctx database not found")?;

        let mut stmt = conn
            .prepare("SELECT name, description, work_dir, created_at FROM sessions ORDER BY name")
            .map_err(|e| format!("ctx query failed: {e}"))?;

        let projects = stmt
            .query_map([], |row| {
                Ok(CtxProject {
                    name: row.get(0)?,
                    description: row.get(1)?,
                    work_dir: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| format!("ctx query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("ctx row read failed: {e}"))?;

        Ok(projects)
    }

    pub fn get_context(&self, project: &str) -> Result<Vec<CtxEntry>, String> {
        let lock = self.conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("ctx database not found")?;

        let mut stmt = conn
            .prepare("SELECT project, key, value, updated_at FROM contexts WHERE project = ?1 ORDER BY key")
            .map_err(|e| format!("ctx query failed: {e}"))?;

        let entries = stmt
            .query_map(params![project], |row| {
                Ok(CtxEntry {
                    project: row.get(0)?,
                    key: row.get(1)?,
                    value: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })
            .map_err(|e| format!("ctx query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("ctx row read failed: {e}"))?;

        Ok(entries)
    }

    pub fn get_shared(&self) -> Result<Vec<CtxEntry>, String> {
        let lock = self.conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("ctx database not found")?;

        let mut stmt = conn
            .prepare("SELECT key, value, updated_at FROM shared ORDER BY key")
            .map_err(|e| format!("ctx query failed: {e}"))?;

        let entries = stmt
            .query_map([], |row| {
                Ok(CtxEntry {
                    project: "shared".to_string(),
                    key: row.get(0)?,
                    value: row.get(1)?,
                    updated_at: row.get(2)?,
                })
            })
            .map_err(|e| format!("ctx query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("ctx row read failed: {e}"))?;

        Ok(entries)
    }

    pub fn get_summaries(&self, project: &str, limit: i64) -> Result<Vec<CtxSummary>, String> {
        let lock = self.conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("ctx database not found")?;

        let mut stmt = conn
            .prepare("SELECT project, summary, created_at FROM summaries WHERE project = ?1 ORDER BY created_at DESC LIMIT ?2")
            .map_err(|e| format!("ctx query failed: {e}"))?;

        let summaries = stmt
            .query_map(params![project, limit], |row| {
                Ok(CtxSummary {
                    project: row.get(0)?,
                    summary: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .map_err(|e| format!("ctx query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("ctx row read failed: {e}"))?;

        Ok(summaries)
    }

    pub fn search(&self, query: &str) -> Result<Vec<CtxEntry>, String> {
        let lock = self.conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("ctx database not found")?;

        let mut stmt = conn
            .prepare("SELECT project, key, value FROM contexts_fts WHERE contexts_fts MATCH ?1 LIMIT 50")
            .map_err(|e| format!("ctx search failed: {e}"))?;

        let entries = stmt
            .query_map(params![query], |row| {
                Ok(CtxEntry {
                    project: row.get(0)?,
                    key: row.get(1)?,
                    value: row.get(2)?,
                    updated_at: String::new(),
                })
            })
            .map_err(|e| format!("ctx search failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("ctx row read failed: {e}"))?;

        Ok(entries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Create a CtxDb with conn set to None, simulating a missing database.
    fn make_missing_db() -> CtxDb {
        CtxDb { conn: Mutex::new(None) }
    }

    #[test]
    fn test_new_does_not_panic() {
        // CtxDb::new() should never panic even if ~/.claude-context/context.db
        // doesn't exist — it just stores None for the connection.
        let _db = CtxDb::new();
    }

    #[test]
    fn test_list_projects_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.list_projects();
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "ctx database not found");
    }

    #[test]
    fn test_get_context_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.get_context("any-project");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "ctx database not found");
    }

    #[test]
    fn test_get_shared_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.get_shared();
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "ctx database not found");
    }

    #[test]
    fn test_get_summaries_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.get_summaries("any-project", 10);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "ctx database not found");
    }

    #[test]
    fn test_search_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.search("anything");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "ctx database not found");
    }

    #[test]
    fn test_search_empty_query_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.search("");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "ctx database not found");
    }
}
