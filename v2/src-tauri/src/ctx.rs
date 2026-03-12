// ctx — Read-only access to the Claude Code context manager database
// Database: ~/.claude-context/context.db (managed by ctx CLI tool)
// Path configurable via new_with_path() for test isolation.

use rusqlite::{Connection, params};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;

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
    path: PathBuf,
}

impl CtxDb {
    fn default_db_path() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_default()
            .join(".claude-context")
            .join("context.db")
    }

    pub fn new() -> Self {
        Self::new_with_path(Self::default_db_path())
    }

    /// Create a CtxDb with a custom database path (for test isolation).
    pub fn new_with_path(db_path: PathBuf) -> Self {
        let conn = if db_path.exists() {
            Connection::open_with_flags(
                &db_path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
            ).ok()
        } else {
            None
        };

        Self { conn: Mutex::new(conn), path: db_path }
    }

    /// Create the context database directory and schema, then open a read-only connection.
    pub fn init_db(&self) -> Result<(), String> {
        let db_path = &self.path;

        // Create parent directory
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {e}"))?;
        }

        // Open read-write to create schema
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to create database: {e}"))?;

        conn.execute_batch("PRAGMA journal_mode=WAL;").map_err(|e| format!("WAL mode failed: {e}"))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                name TEXT PRIMARY KEY,
                description TEXT,
                work_dir TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS contexts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now')),
                UNIQUE(project, key)
            );

            CREATE TABLE IF NOT EXISTS shared (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project TEXT NOT NULL,
                summary TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS contexts_fts USING fts5(
                project, key, value, content=contexts, content_rowid=id
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS shared_fts USING fts5(
                key, value, content=shared
            );

            CREATE TRIGGER IF NOT EXISTS contexts_ai AFTER INSERT ON contexts BEGIN
                INSERT INTO contexts_fts(rowid, project, key, value)
                VALUES (new.id, new.project, new.key, new.value);
            END;

            CREATE TRIGGER IF NOT EXISTS contexts_ad AFTER DELETE ON contexts BEGIN
                INSERT INTO contexts_fts(contexts_fts, rowid, project, key, value)
                VALUES ('delete', old.id, old.project, old.key, old.value);
            END;

            CREATE TRIGGER IF NOT EXISTS contexts_au AFTER UPDATE ON contexts BEGIN
                INSERT INTO contexts_fts(contexts_fts, rowid, project, key, value)
                VALUES ('delete', old.id, old.project, old.key, old.value);
                INSERT INTO contexts_fts(rowid, project, key, value)
                VALUES (new.id, new.project, new.key, new.value);
            END;"
        ).map_err(|e| format!("Schema creation failed: {e}"))?;

        drop(conn);

        // Re-open as read-only for normal operation
        let ro_conn = Connection::open_with_flags(
            &db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        ).map_err(|e| format!("Failed to reopen database: {e}"))?;

        let mut lock = self.conn.lock().map_err(|_| "ctx database lock poisoned".to_string())?;
        *lock = Some(ro_conn);

        Ok(())
    }

    /// Register a project in the ctx database (creates if not exists).
    /// Opens a brief read-write connection; the main self.conn stays read-only.
    pub fn register_project(&self, name: &str, description: &str, work_dir: Option<&str>) -> Result<(), String> {
        let db_path = &self.path;
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("ctx database not found: {e}"))?;

        conn.execute(
            "INSERT OR IGNORE INTO sessions (name, description, work_dir) VALUES (?1, ?2, ?3)",
            rusqlite::params![name, description, work_dir],
        ).map_err(|e| format!("Failed to register project: {e}"))?;

        Ok(())
    }

    pub fn get_context(&self, project: &str) -> Result<Vec<CtxEntry>, String> {
        let lock = self.conn.lock().map_err(|_| "ctx database lock poisoned".to_string())?;
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
        let lock = self.conn.lock().map_err(|_| "ctx database lock poisoned".to_string())?;
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
        let lock = self.conn.lock().map_err(|_| "ctx database lock poisoned".to_string())?;
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
        let lock = self.conn.lock().map_err(|_| "ctx database lock poisoned".to_string())?;
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
                    updated_at: String::new(), // FTS5 virtual table doesn't store updated_at
                })
            })
            .map_err(|e| {
                let msg = e.to_string();
                if msg.contains("fts5") || msg.contains("syntax") {
                    format!("Invalid search query syntax: {e}")
                } else {
                    format!("ctx search failed: {e}")
                }
            })?
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
        CtxDb { conn: Mutex::new(None), path: PathBuf::from("/nonexistent/context.db") }
    }

    #[test]
    fn test_new_does_not_panic() {
        // CtxDb::new() should never panic even if ~/.claude-context/context.db
        // doesn't exist — it just stores None for the connection.
        let _db = CtxDb::new();
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
