// bttask — Read access to task board SQLite tables in btmsg.db
// Tasks table created by bttask CLI, shared DB with btmsg
// Path configurable via init() for test isolation.

use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

static DB_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Set the bttask database path. Must be called before any db access.
/// Called from lib.rs setup with AppConfig-resolved path.
pub fn init(path: PathBuf) {
    let _ = DB_PATH.set(path);
}

fn db_path() -> PathBuf {
    DB_PATH.get().cloned().unwrap_or_else(|| {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("bterminal")
            .join("btmsg.db")
    })
}

fn open_db() -> Result<Connection, String> {
    let path = db_path();
    if !path.exists() {
        return Err("btmsg database not found".into());
    }
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("Failed to open btmsg.db: {e}"))?;
    conn.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()))
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;
    conn.query_row("PRAGMA busy_timeout = 5000", [], |_| Ok(()))
        .map_err(|e| format!("Failed to set busy_timeout: {e}"))?;

    // Migration: add version column if missing
    let has_version: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name='version'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if has_version == 0 {
        conn.execute("ALTER TABLE tasks ADD COLUMN version INTEGER DEFAULT 1", [])
            .map_err(|e| format!("Migration (version column) failed: {e}"))?;
    }

    Ok(conn)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub assigned_to: Option<String>,
    pub created_by: String,
    pub group_id: String,
    pub parent_task_id: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
    pub version: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskComment {
    pub id: String,
    pub task_id: String,
    pub agent_id: String,
    pub content: String,
    pub created_at: String,
}

/// Get all tasks for a group
pub fn list_tasks(group_id: &str) -> Result<Vec<Task>, String> {
    let db = open_db()?;
    let mut stmt = db
        .prepare(
            "SELECT id, title, description, status, priority, assigned_to,
                    created_by, group_id, parent_task_id, sort_order,
                    created_at, updated_at, version
             FROM tasks WHERE group_id = ?1
             ORDER BY sort_order ASC, created_at DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(params![group_id], |row| {
            Ok(Task {
                id: row.get("id")?,
                title: row.get("title")?,
                description: row.get::<_, String>("description").unwrap_or_default(),
                status: row.get::<_, String>("status").unwrap_or_else(|_| "todo".into()),
                priority: row.get::<_, String>("priority").unwrap_or_else(|_| "medium".into()),
                assigned_to: row.get("assigned_to")?,
                created_by: row.get("created_by")?,
                group_id: row.get("group_id")?,
                parent_task_id: row.get("parent_task_id")?,
                sort_order: row.get::<_, i32>("sort_order").unwrap_or(0),
                created_at: row.get::<_, String>("created_at").unwrap_or_default(),
                updated_at: row.get::<_, String>("updated_at").unwrap_or_default(),
                version: row.get::<_, i64>("version").unwrap_or(1),
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

/// Get comments for a task
pub fn task_comments(task_id: &str) -> Result<Vec<TaskComment>, String> {
    let db = open_db()?;
    let mut stmt = db
        .prepare(
            "SELECT id, task_id, agent_id, content, created_at
             FROM task_comments WHERE task_id = ?1
             ORDER BY created_at ASC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(params![task_id], |row| {
            Ok(TaskComment {
                id: row.get("id")?,
                task_id: row.get("task_id")?,
                agent_id: row.get("agent_id")?,
                content: row.get("content")?,
                created_at: row.get::<_, String>("created_at").unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

/// Update task status with optimistic locking.
/// `expected_version` must match the current version in the database.
/// Returns the new version on success.
/// When transitioning to 'review', auto-posts to #review-queue channel if it exists.
pub fn update_task_status(task_id: &str, status: &str, expected_version: i64) -> Result<i64, String> {
    let valid = ["todo", "progress", "review", "done", "blocked"];
    if !valid.contains(&status) {
        return Err(format!("Invalid status '{}'. Valid: {:?}", status, valid));
    }
    let db = open_db()?;

    // Fetch task info before update (for channel notification)
    let task_title: Option<(String, String)> = if status == "review" {
        db.query_row(
            "SELECT title, group_id FROM tasks WHERE id = ?1",
            params![task_id],
            |row| Ok((row.get::<_, String>("title")?, row.get::<_, String>("group_id")?)),
        ).ok()
    } else {
        None
    };

    let rows_affected = db.execute(
        "UPDATE tasks SET status = ?1, version = version + 1, updated_at = datetime('now')
         WHERE id = ?2 AND version = ?3",
        params![status, task_id, expected_version],
    )
    .map_err(|e| format!("Update error: {e}"))?;

    if rows_affected == 0 {
        return Err("Task was modified by another agent (version conflict)".into());
    }

    let new_version = expected_version + 1;

    // Auto-post to #review-queue channel on review transition
    if let Some((title, group_id)) = task_title {
        notify_review_channel(&db, &group_id, task_id, &title);
    }

    Ok(new_version)
}

/// Post a notification to #review-queue channel (best-effort, never fails the parent operation)
fn notify_review_channel(db: &Connection, group_id: &str, task_id: &str, title: &str) {
    // Find #review-queue channel for this group
    let channel_id: Option<String> = db
        .query_row(
            "SELECT id FROM channels WHERE name = 'review-queue' AND group_id = ?1",
            params![group_id],
            |row| row.get(0),
        )
        .ok();

    let channel_id = match channel_id {
        Some(id) => id,
        None => {
            // Auto-create #review-queue channel
            match ensure_review_channels(db, group_id) {
                Some(id) => id,
                None => return, // Give up silently
            }
        }
    };

    let msg_id = uuid::Uuid::new_v4().to_string();
    let content = format!("📋 Task ready for review: **{}** (`{}`)", title, task_id);
    let _ = db.execute(
        "INSERT INTO channel_messages (id, channel_id, from_agent, content) VALUES (?1, ?2, 'system', ?3)",
        params![msg_id, channel_id, content],
    );
}

/// Ensure #review-queue and #review-log channels exist for a group.
/// Returns the review-queue channel ID if created/found.
fn ensure_review_channels(db: &Connection, group_id: &str) -> Option<String> {
    // Create channels only if they don't already exist
    for name in &["review-queue", "review-log"] {
        let exists: bool = db
            .query_row(
                "SELECT COUNT(*) > 0 FROM channels WHERE name = ?1 AND group_id = ?2",
                params![name, group_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if !exists {
            let id = uuid::Uuid::new_v4().to_string();
            let _ = db.execute(
                "INSERT INTO channels (id, name, group_id, created_by) VALUES (?1, ?2, ?3, 'system')",
                params![id, name, group_id],
            );
        }
    }

    // Return the review-queue channel ID
    db.query_row(
        "SELECT id FROM channels WHERE name = 'review-queue' AND group_id = ?1",
        params![group_id],
        |row| row.get(0),
    )
    .ok()
}

/// Count tasks in 'review' status for a group
pub fn review_queue_count(group_id: &str) -> Result<i64, String> {
    let db = open_db()?;
    db.query_row(
        "SELECT COUNT(*) FROM tasks WHERE group_id = ?1 AND status = 'review'",
        params![group_id],
        |row| row.get(0),
    )
    .map_err(|e| format!("Query error: {e}"))
}

/// Add a comment to a task
pub fn add_comment(task_id: &str, agent_id: &str, content: &str) -> Result<String, String> {
    let db = open_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO task_comments (id, task_id, agent_id, content) VALUES (?1, ?2, ?3, ?4)",
        params![id, task_id, agent_id, content],
    )
    .map_err(|e| format!("Insert error: {e}"))?;
    Ok(id)
}

/// Create a new task
pub fn create_task(
    title: &str,
    description: &str,
    priority: &str,
    group_id: &str,
    created_by: &str,
    assigned_to: Option<&str>,
) -> Result<String, String> {
    let db = open_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO tasks (id, title, description, priority, group_id, created_by, assigned_to)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, title, description, priority, group_id, created_by, assigned_to],
    )
    .map_err(|e| format!("Insert error: {e}"))?;
    Ok(id)
}

/// Delete a task
pub fn delete_task(task_id: &str) -> Result<(), String> {
    let db = open_db()?;
    db.execute("DELETE FROM task_comments WHERE task_id = ?1", params![task_id])
        .map_err(|e| format!("Delete comments error: {e}"))?;
    db.execute("DELETE FROM tasks WHERE id = ?1", params![task_id])
        .map_err(|e| format!("Delete task error: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT DEFAULT 'todo',
                priority TEXT DEFAULT 'medium',
                assigned_to TEXT,
                created_by TEXT NOT NULL,
                group_id TEXT NOT NULL,
                parent_task_id TEXT,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now')),
                version INTEGER DEFAULT 1
            );
            CREATE TABLE task_comments (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE channels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                group_id TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE channel_messages (
                id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                from_agent TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );",
        )
        .unwrap();
        conn
    }

    // ---- REGRESSION: list_tasks named column access ----

    #[test]
    fn test_list_tasks_named_column_access() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO tasks (id, title, description, status, priority, assigned_to, created_by, group_id, sort_order)
             VALUES ('t1', 'Fix bug', 'Critical fix', 'progress', 'high', 'a1', 'admin', 'g1', 1)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, description, status, priority, assigned_to, created_by, group_id, sort_order)
             VALUES ('t2', 'Add tests', '', 'todo', 'medium', NULL, 'a1', 'g1', 2)",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, title, description, status, priority, assigned_to,
                    created_by, group_id, parent_task_id, sort_order,
                    created_at, updated_at, version
             FROM tasks WHERE group_id = ?1
             ORDER BY sort_order ASC, created_at DESC",
        ).unwrap();

        let tasks: Vec<Task> = stmt.query_map(params!["g1"], |row| {
            Ok(Task {
                id: row.get("id")?,
                title: row.get("title")?,
                description: row.get::<_, String>("description").unwrap_or_default(),
                status: row.get::<_, String>("status").unwrap_or_else(|_| "todo".into()),
                priority: row.get::<_, String>("priority").unwrap_or_else(|_| "medium".into()),
                assigned_to: row.get("assigned_to")?,
                created_by: row.get("created_by")?,
                group_id: row.get("group_id")?,
                parent_task_id: row.get("parent_task_id")?,
                sort_order: row.get::<_, i32>("sort_order").unwrap_or(0),
                created_at: row.get::<_, String>("created_at").unwrap_or_default(),
                updated_at: row.get::<_, String>("updated_at").unwrap_or_default(),
                version: row.get::<_, i64>("version").unwrap_or(1),
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].id, "t1");
        assert_eq!(tasks[0].title, "Fix bug");
        assert_eq!(tasks[0].status, "progress");
        assert_eq!(tasks[0].priority, "high");
        assert_eq!(tasks[0].assigned_to, Some("a1".to_string()));
        assert_eq!(tasks[0].sort_order, 1);

        assert_eq!(tasks[1].id, "t2");
        assert_eq!(tasks[1].assigned_to, None);
        assert_eq!(tasks[1].parent_task_id, None);
    }

    // ---- REGRESSION: task_comments named column access ----

    #[test]
    fn test_task_comments_named_column_access() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO tasks (id, title, created_by, group_id) VALUES ('t1', 'Test', 'admin', 'g1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO task_comments (id, task_id, agent_id, content) VALUES ('c1', 't1', 'a1', 'Working on it')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO task_comments (id, task_id, agent_id, content) VALUES ('c2', 't1', 'a2', 'Looks good')",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, task_id, agent_id, content, created_at
             FROM task_comments WHERE task_id = ?1
             ORDER BY created_at ASC",
        ).unwrap();

        let comments: Vec<TaskComment> = stmt.query_map(params!["t1"], |row| {
            Ok(TaskComment {
                id: row.get("id")?,
                task_id: row.get("task_id")?,
                agent_id: row.get("agent_id")?,
                content: row.get("content")?,
                created_at: row.get::<_, String>("created_at").unwrap_or_default(),
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(comments.len(), 2);
        assert_eq!(comments[0].agent_id, "a1");
        assert_eq!(comments[0].content, "Working on it");
        assert_eq!(comments[1].agent_id, "a2");
    }

    // ---- serde camelCase serialization ----

    #[test]
    fn test_task_serializes_to_camel_case() {
        let task = Task {
            id: "t1".into(),
            title: "Test".into(),
            description: "desc".into(),
            status: "todo".into(),
            priority: "high".into(),
            assigned_to: Some("a1".into()),
            created_by: "admin".into(),
            group_id: "g1".into(),
            parent_task_id: None,
            sort_order: 0,
            created_at: "2026-01-01".into(),
            updated_at: "2026-01-01".into(),
            version: 1,
        };

        let json = serde_json::to_value(&task).unwrap();
        assert!(json.get("assignedTo").is_some(), "expected camelCase 'assignedTo'");
        assert!(json.get("createdBy").is_some(), "expected camelCase 'createdBy'");
        assert!(json.get("groupId").is_some(), "expected camelCase 'groupId'");
        assert!(json.get("parentTaskId").is_some(), "expected camelCase 'parentTaskId'");
        assert!(json.get("sortOrder").is_some(), "expected camelCase 'sortOrder'");
        assert!(json.get("createdAt").is_some(), "expected camelCase 'createdAt'");
        assert!(json.get("updatedAt").is_some(), "expected camelCase 'updatedAt'");
        // Ensure no snake_case leaks
        assert!(json.get("assigned_to").is_none());
        assert!(json.get("created_by").is_none());
        assert!(json.get("group_id").is_none());
    }

    #[test]
    fn test_task_comment_serializes_to_camel_case() {
        let comment = TaskComment {
            id: "c1".into(),
            task_id: "t1".into(),
            agent_id: "a1".into(),
            content: "note".into(),
            created_at: "2026-01-01".into(),
        };

        let json = serde_json::to_value(&comment).unwrap();
        assert!(json.get("taskId").is_some(), "expected camelCase 'taskId'");
        assert!(json.get("agentId").is_some(), "expected camelCase 'agentId'");
        assert!(json.get("createdAt").is_some(), "expected camelCase 'createdAt'");
        assert!(json.get("task_id").is_none());
    }

    // ---- update_task_status validation ----

    #[test]
    fn test_update_task_status_rejects_invalid() {
        // Can't call update_task_status directly (uses open_db), but we can test the validation logic
        let valid = ["todo", "progress", "review", "done", "blocked"];
        assert!(valid.contains(&"todo"));
        assert!(valid.contains(&"done"));
        assert!(!valid.contains(&"invalid"));
        assert!(!valid.contains(&"cancelled"));
    }

    // ---- Review channel auto-creation ----

    #[test]
    fn test_ensure_review_channels_creates_both() {
        let conn = test_db();
        let result = ensure_review_channels(&conn, "g1");
        assert!(result.is_some(), "should return review-queue channel ID");

        // Verify both channels exist
        let queue_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE name = 'review-queue' AND group_id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(queue_count, 1);

        let log_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE name = 'review-log' AND group_id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(log_count, 1);
    }

    #[test]
    fn test_ensure_review_channels_idempotent() {
        let conn = test_db();
        let id1 = ensure_review_channels(&conn, "g1").unwrap();
        let id2 = ensure_review_channels(&conn, "g1").unwrap();
        assert_eq!(id1, id2, "should return same channel ID on repeated calls");

        // Verify no duplicates
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channels WHERE name = 'review-queue' AND group_id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_notify_review_channel_posts_message() {
        let conn = test_db();
        // Insert a task
        conn.execute(
            "INSERT INTO tasks (id, title, created_by, group_id) VALUES ('t1', 'Fix login bug', 'admin', 'g1')",
            [],
        ).unwrap();

        // Trigger notification (should auto-create channel)
        notify_review_channel(&conn, "g1", "t1", "Fix login bug");

        // Verify message was posted
        let msg_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM channel_messages cm
                 JOIN channels c ON cm.channel_id = c.id
                 WHERE c.name = 'review-queue' AND c.group_id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(msg_count, 1);

        // Verify message content
        let content: String = conn
            .query_row(
                "SELECT cm.content FROM channel_messages cm
                 JOIN channels c ON cm.channel_id = c.id
                 WHERE c.name = 'review-queue'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(content.contains("Fix login bug"));
        assert!(content.contains("t1"));
    }

    // ---- Review queue count ----

    #[test]
    fn test_review_queue_count_via_sql() {
        let conn = test_db();
        // Insert tasks with various statuses
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_by, group_id) VALUES ('t1', 'A', 'review', 'admin', 'g1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_by, group_id) VALUES ('t2', 'B', 'review', 'admin', 'g1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_by, group_id) VALUES ('t3', 'C', 'progress', 'admin', 'g1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_by, group_id) VALUES ('t4', 'D', 'review', 'admin', 'g2')",
            [],
        ).unwrap();

        // Count review tasks for g1
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE group_id = ?1 AND status = 'review'",
                params!["g1"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2, "should count only review tasks in g1");

        // Count review tasks for g2
        let count_g2: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM tasks WHERE group_id = ?1 AND status = 'review'",
                params!["g2"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count_g2, 1, "should count only review tasks in g2");
    }

    // ---- Optimistic locking (version column) ----

    #[test]
    fn test_version_column_defaults_to_1() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO tasks (id, title, created_by, group_id) VALUES ('t1', 'Test', 'admin', 'g1')",
            [],
        ).unwrap();

        let version: i64 = conn
            .query_row("SELECT version FROM tasks WHERE id = 't1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn test_optimistic_lock_success() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_by, group_id) VALUES ('t1', 'Test', 'todo', 'admin', 'g1')",
            [],
        ).unwrap();

        // Update with correct version (1)
        let rows = conn.execute(
            "UPDATE tasks SET status = 'progress', version = version + 1, updated_at = datetime('now')
             WHERE id = 't1' AND version = 1",
            [],
        ).unwrap();
        assert_eq!(rows, 1, "should affect 1 row");

        let new_version: i64 = conn
            .query_row("SELECT version FROM tasks WHERE id = 't1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(new_version, 2);
    }

    #[test]
    fn test_optimistic_lock_conflict() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_by, group_id) VALUES ('t1', 'Test', 'todo', 'admin', 'g1')",
            [],
        ).unwrap();

        // First update succeeds
        conn.execute(
            "UPDATE tasks SET status = 'progress', version = version + 1, updated_at = datetime('now')
             WHERE id = 't1' AND version = 1",
            [],
        ).unwrap();

        // Second update with stale version (1) should affect 0 rows
        let rows = conn.execute(
            "UPDATE tasks SET status = 'review', version = version + 1, updated_at = datetime('now')
             WHERE id = 't1' AND version = 1",
            [],
        ).unwrap();
        assert_eq!(rows, 0, "stale version should affect 0 rows");

        // Task should still be in 'progress' state
        let status: String = conn
            .query_row("SELECT status FROM tasks WHERE id = 't1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(status, "progress");
    }

    #[test]
    fn test_version_in_list_tasks_query() {
        let conn = test_db();
        conn.execute(
            "INSERT INTO tasks (id, title, created_by, group_id, sort_order) VALUES ('t1', 'V1', 'admin', 'g1', 1)",
            [],
        ).unwrap();
        // Bump version to 3
        conn.execute("UPDATE tasks SET version = 3 WHERE id = 't1'", []).unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, title, description, status, priority, assigned_to,
                    created_by, group_id, parent_task_id, sort_order,
                    created_at, updated_at, version
             FROM tasks WHERE group_id = ?1",
        ).unwrap();

        let tasks: Vec<Task> = stmt.query_map(params!["g1"], |row| {
            Ok(Task {
                id: row.get("id")?,
                title: row.get("title")?,
                description: row.get::<_, String>("description").unwrap_or_default(),
                status: row.get::<_, String>("status").unwrap_or_else(|_| "todo".into()),
                priority: row.get::<_, String>("priority").unwrap_or_else(|_| "medium".into()),
                assigned_to: row.get("assigned_to")?,
                created_by: row.get("created_by")?,
                group_id: row.get("group_id")?,
                parent_task_id: row.get("parent_task_id")?,
                sort_order: row.get::<_, i32>("sort_order").unwrap_or(0),
                created_at: row.get::<_, String>("created_at").unwrap_or_default(),
                updated_at: row.get::<_, String>("updated_at").unwrap_or_default(),
                version: row.get::<_, i64>("version").unwrap_or(1),
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].version, 3);
    }

    #[test]
    fn test_version_serializes_to_camel_case() {
        let task = Task {
            id: "t1".into(),
            title: "Test".into(),
            description: "".into(),
            status: "todo".into(),
            priority: "medium".into(),
            assigned_to: None,
            created_by: "admin".into(),
            group_id: "g1".into(),
            parent_task_id: None,
            sort_order: 0,
            created_at: "2026-01-01".into(),
            updated_at: "2026-01-01".into(),
            version: 5,
        };

        let json = serde_json::to_value(&task).unwrap();
        assert_eq!(json.get("version").unwrap(), 5);
    }
}
