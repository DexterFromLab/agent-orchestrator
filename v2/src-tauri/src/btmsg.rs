// btmsg — Access to btmsg SQLite database
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
    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(|e| format!("Failed to open btmsg.db: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;
    conn.pragma_update(None, "busy_timeout", 5000)
        .map_err(|e| format!("Failed to set busy_timeout: {e}"))?;
    Ok(conn)
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BtmsgFeedMessage {
    pub id: String,
    pub from_agent: String,
    pub to_agent: String,
    pub content: String,
    pub created_at: String,
    pub reply_to: Option<String>,
    pub sender_name: String,
    pub sender_role: String,
    pub recipient_name: String,
    pub recipient_role: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BtmsgChannel {
    pub id: String,
    pub name: String,
    pub group_id: String,
    pub created_by: String,
    pub member_count: i32,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BtmsgChannelMessage {
    pub id: String,
    pub channel_id: String,
    pub from_agent: String,
    pub content: String,
    pub created_at: String,
    pub sender_name: String,
    pub sender_role: String,
}

pub fn get_agents(group_id: &str) -> Result<Vec<BtmsgAgent>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT a.*, (SELECT COUNT(*) FROM messages m WHERE m.to_agent = a.id AND m.read = 0) as unread_count \
         FROM agents a WHERE a.group_id = ? ORDER BY a.tier, a.role, a.name"
    ).map_err(|e| format!("Query error: {e}"))?;

    let agents = stmt.query_map(params![group_id], |row| {
        Ok(BtmsgAgent {
            id: row.get("id")?,
            name: row.get("name")?,
            role: row.get("role")?,
            group_id: row.get("group_id")?,
            tier: row.get("tier")?,
            model: row.get("model")?,
            status: row.get::<_, Option<String>>("status")?.unwrap_or_else(|| "stopped".into()),
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
         a.name AS sender_name, a.role AS sender_role \
         FROM messages m JOIN agents a ON m.from_agent = a.id \
         WHERE m.to_agent = ? AND m.read = 0 ORDER BY m.created_at ASC"
    ).map_err(|e| format!("Query error: {e}"))?;

    let msgs = stmt.query_map(params![agent_id], |row| {
        Ok(BtmsgMessage {
            id: row.get("id")?,
            from_agent: row.get("from_agent")?,
            to_agent: row.get("to_agent")?,
            content: row.get("content")?,
            read: row.get::<_, i32>("read")? != 0,
            reply_to: row.get("reply_to")?,
            created_at: row.get("created_at")?,
            sender_name: row.get("sender_name")?,
            sender_role: row.get("sender_role")?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    msgs.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn history(agent_id: &str, other_id: &str, limit: i32) -> Result<Vec<BtmsgMessage>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT m.id, m.from_agent, m.to_agent, m.content, m.read, m.reply_to, m.created_at, \
         a.name AS sender_name, a.role AS sender_role \
         FROM messages m JOIN agents a ON m.from_agent = a.id \
         WHERE (m.from_agent = ?1 AND m.to_agent = ?2) OR (m.from_agent = ?2 AND m.to_agent = ?1) \
         ORDER BY m.created_at ASC LIMIT ?3"
    ).map_err(|e| format!("Query error: {e}"))?;

    let msgs = stmt.query_map(params![agent_id, other_id, limit], |row| {
        Ok(BtmsgMessage {
            id: row.get("id")?,
            from_agent: row.get("from_agent")?,
            to_agent: row.get("to_agent")?,
            content: row.get("content")?,
            read: row.get::<_, i32>("read")? != 0,
            reply_to: row.get("reply_to")?,
            created_at: row.get("created_at")?,
            sender_name: row.get("sender_name")?,
            sender_role: row.get("sender_role")?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    msgs.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn send_message(from_agent: &str, to_agent: &str, content: &str) -> Result<String, String> {
    let db = open_db()?;

    // Get sender's group and tier
    let (group_id, sender_tier): (String, i32) = db.query_row(
        "SELECT group_id, tier FROM agents WHERE id = ?",
        params![from_agent],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|e| format!("Sender not found: {e}"))?;

    // Admin (tier 0) bypasses contact restrictions
    if sender_tier > 0 {
        let allowed: bool = db.query_row(
            "SELECT COUNT(*) > 0 FROM contacts WHERE agent_id = ? AND contact_id = ?",
            params![from_agent, to_agent],
            |row| row.get(0),
        ).map_err(|e| format!("Contact check error: {e}"))?;

        if !allowed {
            return Err(format!("Not allowed to message '{to_agent}'"));
        }
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

pub fn ensure_admin(group_id: &str) -> Result<(), String> {
    let db = open_db()?;

    let exists: bool = db.query_row(
        "SELECT COUNT(*) > 0 FROM agents WHERE id = 'admin'",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Query error: {e}"))?;

    if !exists {
        db.execute(
            "INSERT INTO agents (id, name, role, group_id, tier, status) \
             VALUES ('admin', 'Operator', 'admin', ?, 0, 'active')",
            params![group_id],
        ).map_err(|e| format!("Insert error: {e}"))?;
    }

    // Ensure admin has bidirectional contacts with ALL agents in the group
    let mut stmt = db.prepare(
        "SELECT id FROM agents WHERE group_id = ? AND id != 'admin'"
    ).map_err(|e| format!("Query error: {e}"))?;
    let agent_ids: Vec<String> = stmt.query_map(params![group_id], |row| row.get(0))
        .map_err(|e| format!("Query error: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))?;
    drop(stmt);

    for aid in &agent_ids {
        db.execute(
            "INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES ('admin', ?)",
            params![aid],
        ).map_err(|e| format!("Insert error: {e}"))?;
        db.execute(
            "INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES (?, 'admin')",
            params![aid],
        ).map_err(|e| format!("Insert error: {e}"))?;
    }

    Ok(())
}

pub fn all_feed(group_id: &str, limit: i32) -> Result<Vec<BtmsgFeedMessage>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT m.id, m.from_agent, m.to_agent, m.content, m.created_at, m.reply_to, \
         a1.name AS sender_name, a1.role AS sender_role, \
         a2.name AS recipient_name, a2.role AS recipient_role \
         FROM messages m \
         JOIN agents a1 ON m.from_agent = a1.id \
         JOIN agents a2 ON m.to_agent = a2.id \
         WHERE m.group_id = ? \
         ORDER BY m.created_at DESC LIMIT ?"
    ).map_err(|e| format!("Query error: {e}"))?;

    let msgs = stmt.query_map(params![group_id, limit], |row| {
        Ok(BtmsgFeedMessage {
            id: row.get("id")?,
            from_agent: row.get("from_agent")?,
            to_agent: row.get("to_agent")?,
            content: row.get("content")?,
            created_at: row.get("created_at")?,
            reply_to: row.get("reply_to")?,
            sender_name: row.get("sender_name")?,
            sender_role: row.get("sender_role")?,
            recipient_name: row.get("recipient_name")?,
            recipient_role: row.get("recipient_role")?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    msgs.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn mark_read_conversation(reader_id: &str, sender_id: &str) -> Result<(), String> {
    let db = open_db()?;
    db.execute(
        "UPDATE messages SET read = 1 WHERE to_agent = ? AND from_agent = ? AND read = 0",
        params![reader_id, sender_id],
    ).map_err(|e| format!("Update error: {e}"))?;
    Ok(())
}

pub fn get_channels(group_id: &str) -> Result<Vec<BtmsgChannel>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT c.id, c.name, c.group_id, c.created_by, \
         (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) AS member_count, \
         c.created_at \
         FROM channels c WHERE c.group_id = ? ORDER BY c.name"
    ).map_err(|e| format!("Query error: {e}"))?;

    let channels = stmt.query_map(params![group_id], |row| {
        Ok(BtmsgChannel {
            id: row.get("id")?,
            name: row.get("name")?,
            group_id: row.get("group_id")?,
            created_by: row.get("created_by")?,
            member_count: row.get("member_count")?,
            created_at: row.get("created_at")?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    channels.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn get_channel_messages(channel_id: &str, limit: i32) -> Result<Vec<BtmsgChannelMessage>, String> {
    let db = open_db()?;
    let mut stmt = db.prepare(
        "SELECT cm.id, cm.channel_id, cm.from_agent, cm.content, cm.created_at, \
         a.name AS sender_name, a.role AS sender_role \
         FROM channel_messages cm JOIN agents a ON cm.from_agent = a.id \
         WHERE cm.channel_id = ? ORDER BY cm.created_at ASC LIMIT ?"
    ).map_err(|e| format!("Query error: {e}"))?;

    let msgs = stmt.query_map(params![channel_id, limit], |row| {
        Ok(BtmsgChannelMessage {
            id: row.get("id")?,
            channel_id: row.get("channel_id")?,
            from_agent: row.get("from_agent")?,
            content: row.get("content")?,
            created_at: row.get("created_at")?,
            sender_name: row.get("sender_name")?,
            sender_role: row.get("sender_role")?,
        })
    }).map_err(|e| format!("Query error: {e}"))?;

    msgs.collect::<Result<Vec<_>, _>>().map_err(|e| format!("Row error: {e}"))
}

pub fn send_channel_message(channel_id: &str, from_agent: &str, content: &str) -> Result<String, String> {
    let db = open_db()?;

    // Verify channel exists
    let _: String = db.query_row(
        "SELECT id FROM channels WHERE id = ?",
        params![channel_id],
        |row| row.get(0),
    ).map_err(|e| format!("Channel not found: {e}"))?;

    // Check membership (admin bypasses)
    let sender_tier: i32 = db.query_row(
        "SELECT tier FROM agents WHERE id = ?",
        params![from_agent],
        |row| row.get(0),
    ).map_err(|e| format!("Sender not found: {e}"))?;

    if sender_tier > 0 {
        let is_member: bool = db.query_row(
            "SELECT COUNT(*) > 0 FROM channel_members WHERE channel_id = ? AND agent_id = ?",
            params![channel_id, from_agent],
            |row| row.get(0),
        ).map_err(|e| format!("Membership check error: {e}"))?;

        if !is_member {
            return Err("Not a member of this channel".into());
        }
    }

    let msg_id = uuid::Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO channel_messages (id, channel_id, from_agent, content) VALUES (?1, ?2, ?3, ?4)",
        params![msg_id, channel_id, from_agent, content],
    ).map_err(|e| format!("Insert error: {e}"))?;

    Ok(msg_id)
}

pub fn create_channel(name: &str, group_id: &str, created_by: &str) -> Result<String, String> {
    let db = open_db()?;
    let channel_id = uuid::Uuid::new_v4().to_string()[..8].to_string();

    db.execute(
        "INSERT INTO channels (id, name, group_id, created_by) VALUES (?1, ?2, ?3, ?4)",
        params![channel_id, name, group_id, created_by],
    ).map_err(|e| format!("Insert error: {e}"))?;

    // Auto-add creator as member
    db.execute(
        "INSERT INTO channel_members (channel_id, agent_id) VALUES (?1, ?2)",
        params![channel_id, created_by],
    ).map_err(|e| format!("Insert error: {e}"))?;

    Ok(channel_id)
}

pub fn add_channel_member(channel_id: &str, agent_id: &str) -> Result<(), String> {
    let db = open_db()?;
    db.execute(
        "INSERT OR IGNORE INTO channel_members (channel_id, agent_id) VALUES (?1, ?2)",
        params![channel_id, agent_id],
    ).map_err(|e| format!("Insert error: {e}"))?;
    Ok(())
}
