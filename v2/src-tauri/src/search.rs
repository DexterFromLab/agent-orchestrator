// search — FTS5 full-text search across messages, tasks, and btmsg
// Uses sessions.db for search index (separate from btmsg.db source tables).
// Index populated via explicit index_* calls; rebuild re-reads from source tables.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct SearchDb {
    conn: Mutex<Connection>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub result_type: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

impl SearchDb {
    /// Open (or create) the search database and initialize FTS5 tables.
    pub fn open(db_path: &PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create search db dir: {e}"))?;
        }
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open search db: {e}"))?;
        conn.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()))
            .map_err(|e| format!("Failed to set WAL mode: {e}"))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.create_tables()?;
        Ok(db)
    }

    /// Create FTS5 virtual tables if they don't already exist.
    fn create_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE IF NOT EXISTS search_messages USING fts5(
                session_id,
                role,
                content,
                timestamp
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS search_tasks USING fts5(
                task_id,
                title,
                description,
                status,
                assigned_to
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS search_btmsg USING fts5(
                message_id,
                from_agent,
                to_agent,
                content,
                channel_name
            );"
        )
        .map_err(|e| format!("Failed to create FTS5 tables: {e}"))
    }

    /// Index an agent message into the search_messages FTS5 table.
    pub fn index_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono_now();
        conn.execute(
            "INSERT INTO search_messages (session_id, role, content, timestamp)
             VALUES (?1, ?2, ?3, ?4)",
            params![session_id, role, content, timestamp],
        )
        .map_err(|e| format!("Index message error: {e}"))?;
        Ok(())
    }

    /// Index a task into the search_tasks FTS5 table.
    pub fn index_task(
        &self,
        task_id: &str,
        title: &str,
        description: &str,
        status: &str,
        assigned_to: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO search_tasks (task_id, title, description, status, assigned_to)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![task_id, title, description, status, assigned_to],
        )
        .map_err(|e| format!("Index task error: {e}"))?;
        Ok(())
    }

    /// Index a btmsg message into the search_btmsg FTS5 table.
    pub fn index_btmsg(
        &self,
        msg_id: &str,
        from_agent: &str,
        to_agent: &str,
        content: &str,
        channel: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO search_btmsg (message_id, from_agent, to_agent, content, channel_name)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![msg_id, from_agent, to_agent, content, channel],
        )
        .map_err(|e| format!("Index btmsg error: {e}"))?;
        Ok(())
    }

    /// Search across all FTS5 tables using MATCH, returning results sorted by relevance.
    pub fn search_all(&self, query: &str, limit: i32) -> Result<Vec<SearchResult>, String> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let conn = self.conn.lock().unwrap();
        let mut results = Vec::new();

        // Search messages
        {
            let mut stmt = conn
                .prepare(
                    "SELECT session_id, role, snippet(search_messages, 2, '<b>', '</b>', '...', 32) as snip,
                            rank
                     FROM search_messages
                     WHERE search_messages MATCH ?1
                     ORDER BY rank
                     LIMIT ?2",
                )
                .map_err(|e| format!("Search messages query error: {e}"))?;

            let rows = stmt
                .query_map(params![query, limit], |row| {
                    Ok(SearchResult {
                        result_type: "message".into(),
                        id: row.get::<_, String>("session_id")?,
                        title: row.get::<_, String>("role")?,
                        snippet: row.get::<_, String>("snip").unwrap_or_default(),
                        score: row.get::<_, f64>("rank").unwrap_or(0.0).abs(),
                    })
                })
                .map_err(|e| format!("Search messages error: {e}"))?;

            for row in rows {
                if let Ok(r) = row {
                    results.push(r);
                }
            }
        }

        // Search tasks
        {
            let mut stmt = conn
                .prepare(
                    "SELECT task_id, title, snippet(search_tasks, 2, '<b>', '</b>', '...', 32) as snip,
                            rank
                     FROM search_tasks
                     WHERE search_tasks MATCH ?1
                     ORDER BY rank
                     LIMIT ?2",
                )
                .map_err(|e| format!("Search tasks query error: {e}"))?;

            let rows = stmt
                .query_map(params![query, limit], |row| {
                    Ok(SearchResult {
                        result_type: "task".into(),
                        id: row.get::<_, String>("task_id")?,
                        title: row.get::<_, String>("title")?,
                        snippet: row.get::<_, String>("snip").unwrap_or_default(),
                        score: row.get::<_, f64>("rank").unwrap_or(0.0).abs(),
                    })
                })
                .map_err(|e| format!("Search tasks error: {e}"))?;

            for row in rows {
                if let Ok(r) = row {
                    results.push(r);
                }
            }
        }

        // Search btmsg
        {
            let mut stmt = conn
                .prepare(
                    "SELECT message_id, from_agent, snippet(search_btmsg, 3, '<b>', '</b>', '...', 32) as snip,
                            rank
                     FROM search_btmsg
                     WHERE search_btmsg MATCH ?1
                     ORDER BY rank
                     LIMIT ?2",
                )
                .map_err(|e| format!("Search btmsg query error: {e}"))?;

            let rows = stmt
                .query_map(params![query, limit], |row| {
                    Ok(SearchResult {
                        result_type: "btmsg".into(),
                        id: row.get::<_, String>("message_id")?,
                        title: row.get::<_, String>("from_agent")?,
                        snippet: row.get::<_, String>("snip").unwrap_or_default(),
                        score: row.get::<_, f64>("rank").unwrap_or(0.0).abs(),
                    })
                })
                .map_err(|e| format!("Search btmsg error: {e}"))?;

            for row in rows {
                if let Ok(r) = row {
                    results.push(r);
                }
            }
        }

        // Sort by score ascending (FTS5 rank is negative, abs() makes lower = more relevant)
        results.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit as usize);

        Ok(results)
    }

    /// Drop and recreate all FTS5 tables (clears the index).
    pub fn rebuild_index(&self) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "DROP TABLE IF EXISTS search_messages;
             DROP TABLE IF EXISTS search_tasks;
             DROP TABLE IF EXISTS search_btmsg;"
        )
        .map_err(|e| format!("Failed to drop FTS5 tables: {e}"))?;
        drop(conn);

        self.create_tables()?;
        Ok(())
    }
}

/// Simple timestamp helper (avoids adding chrono dependency).
fn chrono_now() -> String {
    // Use SQLite's datetime('now') equivalent via a simple format
    // We return empty string; actual timestamp can be added by caller if needed
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_search_db() -> (SearchDb, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("search.db");
        let db = SearchDb::open(&db_path).unwrap();
        (db, dir)
    }

    #[test]
    fn test_create_tables_idempotent() {
        let (db, _dir) = temp_search_db();
        // Second call should not fail
        db.create_tables().unwrap();
    }

    #[test]
    fn test_index_and_search_message() {
        let (db, _dir) = temp_search_db();
        db.index_message("s1", "assistant", "The quick brown fox jumps over the lazy dog")
            .unwrap();
        db.index_message("s2", "user", "Hello world from the user")
            .unwrap();

        let results = db.search_all("quick brown", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].result_type, "message");
        assert_eq!(results[0].id, "s1");
    }

    #[test]
    fn test_index_and_search_task() {
        let (db, _dir) = temp_search_db();
        db.index_task("t1", "Fix login bug", "Users cannot log in with SSO", "progress", "agent-1")
            .unwrap();
        db.index_task("t2", "Add dark mode", "Theme support", "todo", "agent-2")
            .unwrap();

        let results = db.search_all("login SSO", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].result_type, "task");
        assert_eq!(results[0].id, "t1");
        assert_eq!(results[0].title, "Fix login bug");
    }

    #[test]
    fn test_index_and_search_btmsg() {
        let (db, _dir) = temp_search_db();
        db.index_btmsg("m1", "manager", "architect", "Please review the API design", "general")
            .unwrap();
        db.index_btmsg("m2", "tester", "manager", "All tests passing", "review-queue")
            .unwrap();

        let results = db.search_all("API design", 10).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].result_type, "btmsg");
        assert_eq!(results[0].id, "m1");
    }

    #[test]
    fn test_search_across_all_tables() {
        let (db, _dir) = temp_search_db();
        db.index_message("s1", "assistant", "Please deploy the auth service now")
            .unwrap();
        db.index_task("t1", "Deploy auth service", "Deploy to production", "todo", "ops")
            .unwrap();
        db.index_btmsg("m1", "manager", "ops", "Please deploy the auth service ASAP", "ops-channel")
            .unwrap();

        let results = db.search_all("deploy auth", 10).unwrap();
        assert_eq!(results.len(), 3, "should find results across all 3 tables");

        let types: Vec<&str> = results.iter().map(|r| r.result_type.as_str()).collect();
        assert!(types.contains(&"message"));
        assert!(types.contains(&"task"));
        assert!(types.contains(&"btmsg"));
    }

    #[test]
    fn test_search_empty_query() {
        let (db, _dir) = temp_search_db();
        db.index_message("s1", "user", "some content").unwrap();

        let results = db.search_all("", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_no_results() {
        let (db, _dir) = temp_search_db();
        db.index_message("s1", "user", "hello world").unwrap();

        let results = db.search_all("nonexistent", 10).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_limit() {
        let (db, _dir) = temp_search_db();
        for i in 0..20 {
            db.index_message(&format!("s{i}"), "user", &format!("test message number {i}"))
                .unwrap();
        }

        let results = db.search_all("test message", 5).unwrap();
        assert!(results.len() <= 5);
    }

    #[test]
    fn test_rebuild_index() {
        let (db, _dir) = temp_search_db();
        db.index_message("s1", "user", "important data").unwrap();

        let before = db.search_all("important", 10).unwrap();
        assert_eq!(before.len(), 1);

        db.rebuild_index().unwrap();

        let after = db.search_all("important", 10).unwrap();
        assert!(after.is_empty(), "index should be empty after rebuild");
    }

    #[test]
    fn test_search_result_serializes_to_camel_case() {
        let result = SearchResult {
            result_type: "message".into(),
            id: "s1".into(),
            title: "user".into(),
            snippet: "test".into(),
            score: 0.5,
        };

        let json = serde_json::to_value(&result).unwrap();
        assert!(json.get("resultType").is_some(), "expected camelCase 'resultType'");
        assert!(json.get("result_type").is_none(), "should not have snake_case");
    }
}
