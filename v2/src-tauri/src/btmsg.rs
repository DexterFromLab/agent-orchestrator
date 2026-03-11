// btmsg — Read-only access to btmsg SQLite database
// Database at ~/.local/share/bterminal/btmsg.db (created by btmsg CLI)

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
        return Err("btmsg database not found. Run 'btmsg register' first.".into());
    }
    Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("Failed to open btmsg.db: {e}"))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BtmsgAgent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub group_id: String,
    pub tier: i32,
    pub model: Option<String>,
    pub status: String,
    pub unread_count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BtmsgMessage {
    pub id: String,
    pub from_agent: String,
    pub to_agent: String,
    pub content: String,
    pub read: bool,
    pub reply_to: Option<String>,
    pub created_at: String,
    pub sender_name: Option<String>,
    pub sender_role: Option<String>,
}

pub fn get_agents(group_id: &str) -> Result<Vec<BtmsgAgent>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT a.*, (SELECT COUNT(*) FROM messages m WHERE m.to_agent = a.id AND m.read = 0) as unread_count \
         FROM agents a WHERE a.group_id = ? ORDER BY a.tier, a.role, a.name"
    ).map_err(|e| format!("Query error: {e}"))?;

    let agents = stmt.query_map(params![group_id], |row| {
        Ok(BtmsgAgent {
            id: row.get(0)?,
            name: row.get(1)?,
            role: row.get(2)?,
            group_id: row.get(3)?,
            tier: row.get(4)?,
            model: row.get(5)?,
            status: row.get::<_, Option<String>>(7)?.unwrap_or_else(|| "stopped".into()),
            unread_count: row.get("unread_count")?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    agents.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn unread_count(agent_id: &str) -> Result<i32, String> {
    let db = open_db()?;
    db.query_row(
        "SELECT COUNT(*) FROM messages WHERE to_agent = ? AND read = 0",
        params![agent_id],
        |row| row.get(0),
    ).map_err(|e| format!("Query error: {e}"))
}

pub fn unread_messages(agent_id: &str) -> Result<Vec<BtmsgMessage>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT m.id, m.from_agent, m.to_agent, m.content, m.read, m.reply_to, m.created_at, \
         a.name, a.role \
         FROM messages m JOIN agents a ON m.from_agent = a.id \
         WHERE m.to_agent = ? AND m.read = 0 ORDER BY m.created_at ASC"
    ).map_err(|e| format!("Query error: {e}"))?;

    let msgs = stmt.query_map(params![agent_id], |row| {
        Ok(BtmsgMessage {
            id: row.get(0)?,
            from_agent: row.get(1)?,
            to_agent: row.get(2)?,
            content: row.get(3)?,
            read: row.get::<_, i32>(4)? != 0,
            reply_to: row.get(5)?,
            created_at: row.get(6)?,
            sender_name: row.get(7)?,
            sender_role: row.get(8)?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    msgs.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn history(agent_id: &str, other_id: &str, limit: i32) -> Result<Vec<BtmsgMessage>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT m.id, m.from_agent, m.to_agent, m.content, m.read, m.reply_to, m.created_at, \
         a.name, a.role \
         FROM messages m JOIN agents a ON m.from_agent = a.id \
         WHERE (m.from_agent = ?1 AND m.to_agent = ?2) OR (m.from_agent = ?2 AND m.to_agent = ?1) \
         ORDER BY m.created_at ASC LIMIT ?3"
    ).map_err(|e| format!("Query error: {e}"))?;

    let msgs = stmt.query_map(params![agent_id, other_id, limit], |row| {
        Ok(BtmsgMessage {
            id: row.get(0)?,
            from_agent: row.get(1)?,
            to_agent: row.get(2)?,
            content: row.get(3)?,
            read: row.get::<_, i32>(4)? != 0,
            reply_to: row.get(5)?,
            created_at: row.get(6)?,
            sender_name: row.get(7)?,
            sender_role: row.get(8)?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    msgs.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn send_message(from_agent: &str, to_agent: &str, content: &str) -> Result<String, String> {
    let db = open_db()?;

    // Get sender's group
    let group_id: String = db.query_row(
        "SELECT group_id FROM agents WHERE id = ?",
        params![from_agent],
        |row| row.get(0),
    ).map_err(|e| format!("Sender not found: {e}"))?;

    // Check contact permission
    let allowed: bool = db.query_row(
        "SELECT COUNT(*) > 0 FROM contacts WHERE agent_id = ? AND contact_id = ?",
        params![from_agent, to_agent],
        |row| row.get(0),
    ).map_err(|e| format!("Contact check error: {e}"))?;

    if !allowed {
        return Err(format!("Not allowed to message '{to_agent}'"));
    }

    let msg_id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO messages (id, from_agent, to_agent, content, group_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![msg_id, from_agent, to_agent, content, group_id],
    ).map_err(|e| format!("Insert error: {e}"))?;

    Ok(msg_id)
}

pub fn set_status(agent_id: &str, status: &str) -> Result<(), String> {
    let db = open_db()?;
    db.execute(
        "UPDATE agents SET status = ?, last_active_at = datetime('now') WHERE id = ?",
        params![status, agent_id],
    ).map_err(|e| format!("Update error: {e}"))?;
    Ok(())
}
