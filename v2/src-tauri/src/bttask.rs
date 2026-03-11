// bttask — Read access to task board SQLite tables in btmsg.db
// Tasks table created by bttask CLI, shared DB with btmsg

use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn db_path() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("bterminal")
        .join("btmsg.db")
}

fn open_db() -> Result<Connection, String> {
    let path = db_path();
    if !path.exists() {
        return Err("btmsg database not found".into());
    }
    Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("Failed to open btmsg.db: {e}"))
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
                    created_at, updated_at
             FROM tasks WHERE group_id = ?1
             ORDER BY sort_order ASC, created_at DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(params![group_id], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get::<_, String>(2).unwrap_or_default(),
                status: row.get::<_, String>(3).unwrap_or_else(|_| "todo".into()),
                priority: row.get::<_, String>(4).unwrap_or_else(|_| "medium".into()),
                assigned_to: row.get(5)?,
                created_by: row.get(6)?,
                group_id: row.get(7)?,
                parent_task_id: row.get(8)?,
                sort_order: row.get::<_, i32>(9).unwrap_or(0),
                created_at: row.get::<_, String>(10).unwrap_or_default(),
                updated_at: row.get::<_, String>(11).unwrap_or_default(),
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
                id: row.get(0)?,
                task_id: row.get(1)?,
                agent_id: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get::<_, String>(4).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

/// Update task status
pub fn update_task_status(task_id: &str, status: &str) -> Result<(), String> {
    let valid = ["todo", "progress", "review", "done", "blocked"];
    if !valid.contains(&status) {
        return Err(format!("Invalid status '{}'. Valid: {:?}", status, valid));
    }
    let db = open_db()?;
    db.execute(
        "UPDATE tasks SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![status, task_id],
    )
    .map_err(|e| format!("Update error: {e}"))?;
    Ok(())
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
