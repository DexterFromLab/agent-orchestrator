// memora — Read-only access to the Memora memory database
// Database: ~/.local/share/memora/memories.db (managed by Memora MCP server)

use rusqlite::{Connection, params};
use serde::Serialize;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize)]
pub struct MemoraNode {
    pub id: i64,
    pub content: String,
    pub tags: Vec<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemoraSearchResult {
    pub nodes: Vec<MemoraNode>,
    pub total: i64,
}

pub struct MemoraDb {
    conn: Mutex<Option<Connection>>,
}

impl MemoraDb {
    fn default_db_path() -> std::path::PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".local/share"))
            .join("memora")
            .join("memories.db")
    }

    pub fn new() -> Self {
        Self::new_with_path(Self::default_db_path())
    }

    /// Create a MemoraDb with a custom database path (for test isolation).
    pub fn new_with_path(db_path: std::path::PathBuf) -> Self {
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

    /// Check if the database connection is available.
    pub fn is_available(&self) -> bool {
        let lock = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        lock.is_some()
    }

    fn parse_row(row: &rusqlite::Row) -> rusqlite::Result<MemoraNode> {
        let tags_raw: String = row.get(2)?;
        let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();

        let meta_raw: Option<String> = row.get(3)?;
        let metadata = meta_raw.and_then(|m| serde_json::from_str(&m).ok());

        Ok(MemoraNode {
            id: row.get(0)?,
            content: row.get(1)?,
            tags,
            metadata,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    }

    pub fn list(
        &self,
        tags: Option<Vec<String>>,
        limit: i64,
        offset: i64,
    ) -> Result<MemoraSearchResult, String> {
        let lock = self.conn.lock().map_err(|_| "memora database lock poisoned".to_string())?;
        let conn = lock.as_ref().ok_or("memora database not found")?;

        if let Some(ref tag_list) = tags {
            if !tag_list.is_empty() {
                return self.list_by_tags(conn, tag_list, limit, offset);
            }
        }

        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))
            .map_err(|e| format!("memora count failed: {e}"))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, content, tags, metadata, created_at, updated_at
                 FROM memories ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            )
            .map_err(|e| format!("memora query failed: {e}"))?;

        let nodes = stmt
            .query_map(params![limit, offset], Self::parse_row)
            .map_err(|e| format!("memora query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("memora row read failed: {e}"))?;

        Ok(MemoraSearchResult { nodes, total })
    }

    fn list_by_tags(
        &self,
        conn: &Connection,
        tags: &[String],
        limit: i64,
        offset: i64,
    ) -> Result<MemoraSearchResult, String> {
        // Filter memories whose JSON tags array contains ANY of the given tags.
        // Uses json_each() to expand the tags array and match against the filter list.
        let placeholders: Vec<String> = tags.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
        let in_clause = placeholders.join(", ");

        let count_sql = format!(
            "SELECT COUNT(DISTINCT m.id) FROM memories m, json_each(m.tags) j WHERE j.value IN ({in_clause})"
        );
        let query_sql = format!(
            "SELECT DISTINCT m.id, m.content, m.tags, m.metadata, m.created_at, m.updated_at
             FROM memories m, json_each(m.tags) j
             WHERE j.value IN ({in_clause})
             ORDER BY m.id DESC LIMIT ?{} OFFSET ?{}",
            tags.len() + 1,
            tags.len() + 2,
        );

        let tag_params: Vec<&dyn rusqlite::ToSql> = tags.iter().map(|t| t as &dyn rusqlite::ToSql).collect();

        let count_params = tag_params.clone();
        let total: i64 = conn
            .query_row(&count_sql, count_params.as_slice(), |r| r.get(0))
            .map_err(|e| format!("memora count failed: {e}"))?;

        let mut query_params = tag_params;
        query_params.push(&limit);
        query_params.push(&offset);

        let mut stmt = conn
            .prepare(&query_sql)
            .map_err(|e| format!("memora query failed: {e}"))?;

        let nodes = stmt
            .query_map(query_params.as_slice(), Self::parse_row)
            .map_err(|e| format!("memora query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("memora row read failed: {e}"))?;

        Ok(MemoraSearchResult { nodes, total })
    }

    pub fn search(
        &self,
        query: &str,
        tags: Option<Vec<String>>,
        limit: i64,
    ) -> Result<MemoraSearchResult, String> {
        let lock = self.conn.lock().map_err(|_| "memora database lock poisoned".to_string())?;
        let conn = lock.as_ref().ok_or("memora database not found")?;

        // Use FTS5 for text search with optional tag filter
        let fts_query = query.to_string();

        if let Some(ref tag_list) = tags {
            if !tag_list.is_empty() {
                return self.search_with_tags(conn, &fts_query, tag_list, limit);
            }
        }

        let mut stmt = conn
            .prepare(
                "SELECT m.id, m.content, m.tags, m.metadata, m.created_at, m.updated_at
                 FROM memories_fts f
                 JOIN memories m ON m.id = f.rowid
                 WHERE memories_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2",
            )
            .map_err(|e| format!("memora search failed: {e}"))?;

        let nodes = stmt
            .query_map(params![fts_query, limit], Self::parse_row)
            .map_err(|e| {
                let msg = e.to_string();
                if msg.contains("fts5") || msg.contains("syntax") {
                    format!("Invalid search query: {e}")
                } else {
                    format!("memora search failed: {e}")
                }
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("memora row read failed: {e}"))?;

        let total = nodes.len() as i64;
        Ok(MemoraSearchResult { nodes, total })
    }

    fn search_with_tags(
        &self,
        conn: &Connection,
        query: &str,
        tags: &[String],
        limit: i64,
    ) -> Result<MemoraSearchResult, String> {
        let placeholders: Vec<String> = tags.iter().enumerate().map(|(i, _)| format!("?{}", i + 3)).collect();
        let in_clause = placeholders.join(", ");

        let sql = format!(
            "SELECT DISTINCT m.id, m.content, m.tags, m.metadata, m.created_at, m.updated_at
             FROM memories_fts f
             JOIN memories m ON m.id = f.rowid
             JOIN json_each(m.tags) j ON j.value IN ({in_clause})
             WHERE memories_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2"
        );

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        params.push(Box::new(query.to_string()));
        params.push(Box::new(limit));
        for tag in tags {
            params.push(Box::new(tag.clone()));
        }
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("memora search failed: {e}"))?;

        let nodes = stmt
            .query_map(param_refs.as_slice(), Self::parse_row)
            .map_err(|e| {
                let msg = e.to_string();
                if msg.contains("fts5") || msg.contains("syntax") {
                    format!("Invalid search query: {e}")
                } else {
                    format!("memora search failed: {e}")
                }
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("memora row read failed: {e}"))?;

        let total = nodes.len() as i64;
        Ok(MemoraSearchResult { nodes, total })
    }

    pub fn get(&self, id: i64) -> Result<Option<MemoraNode>, String> {
        let lock = self.conn.lock().map_err(|_| "memora database lock poisoned".to_string())?;
        let conn = lock.as_ref().ok_or("memora database not found")?;

        let mut stmt = conn
            .prepare(
                "SELECT id, content, tags, metadata, created_at, updated_at
                 FROM memories WHERE id = ?1",
            )
            .map_err(|e| format!("memora query failed: {e}"))?;

        let mut rows = stmt
            .query_map(params![id], Self::parse_row)
            .map_err(|e| format!("memora query failed: {e}"))?;

        match rows.next() {
            Some(Ok(node)) => Ok(Some(node)),
            Some(Err(e)) => Err(format!("memora row read failed: {e}")),
            None => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_missing_db() -> MemoraDb {
        MemoraDb { conn: Mutex::new(None) }
    }

    #[test]
    fn test_new_does_not_panic() {
        let _db = MemoraDb::new();
    }

    #[test]
    fn test_missing_db_not_available() {
        let db = make_missing_db();
        assert!(!db.is_available());
    }

    #[test]
    fn test_list_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.list(None, 50, 0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "memora database not found");
    }

    #[test]
    fn test_search_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.search("test", None, 50);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "memora database not found");
    }

    #[test]
    fn test_get_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.get(1);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "memora database not found");
    }

    #[test]
    fn test_list_with_tags_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.list(Some(vec!["bterminal".to_string()]), 50, 0);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "memora database not found");
    }

    #[test]
    fn test_search_with_tags_missing_db_returns_error() {
        let db = make_missing_db();
        let result = db.search("test", Some(vec!["bterminal".to_string()]), 50);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "memora database not found");
    }
}
