// btmsg — Access to btmsg SQLite database
// Database at ~/.local/share/bterminal/btmsg.db (created by btmsg CLI)
// Path configurable via init() for test isolation.

use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

static DB_PATH: OnceLock<PathBuf> = OnceLock::new();

/// Set the btmsg database path. Must be called before any db access.
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

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Create an in-memory DB with the btmsg schema for testing.
    fn test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                group_id TEXT NOT NULL,
                tier INTEGER NOT NULL DEFAULT 1,
                model TEXT,
                cwd TEXT,
                system_prompt TEXT,
                status TEXT DEFAULT 'stopped',
                last_active_at TEXT
            );
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                from_agent TEXT NOT NULL,
                to_agent TEXT NOT NULL,
                content TEXT NOT NULL,
                group_id TEXT NOT NULL,
                read INTEGER DEFAULT 0,
                reply_to TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE contacts (
                agent_id TEXT NOT NULL,
                contact_id TEXT NOT NULL,
                PRIMARY KEY (agent_id, contact_id)
            );
            CREATE TABLE channels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                group_id TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE channel_members (
                channel_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                PRIMARY KEY (channel_id, agent_id)
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

    fn seed_agents(conn: &Connection) {
        conn.execute(
            "INSERT INTO agents (id, name, role, group_id, tier, model, system_prompt, status)
             VALUES ('a1', 'Coder', 'developer', 'g1', 1, 'claude-4', 'You are a coder', 'active')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO agents (id, name, role, group_id, tier, model, system_prompt, status)
             VALUES ('a2', 'Reviewer', 'reviewer', 'g1', 2, NULL, 'You review code', 'sleeping')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO agents (id, name, role, group_id, tier, model, system_prompt, status)
             VALUES ('admin', 'Operator', 'admin', 'g1', 0, NULL, NULL, 'active')",
            [],
        ).unwrap();
    }

    // ---- CRITICAL REGRESSION: get_agents named column access ----
    // Bug: positional index 7 returned system_prompt instead of status (column 8).
    // Fix: named access via row.get("status").

    #[test]
    fn test_get_agents_returns_status_not_system_prompt() {
        let conn = test_db();
        seed_agents(&conn);

        let mut stmt = conn.prepare(
            "SELECT a.*, (SELECT COUNT(*) FROM messages m WHERE m.to_agent = a.id AND m.read = 0) as unread_count \
             FROM agents a WHERE a.group_id = ? ORDER BY a.tier, a.role, a.name"
        ).unwrap();

        let agents: Vec<BtmsgAgent> = stmt.query_map(params!["g1"], |row| {
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
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(agents.len(), 3);

        // admin (tier 0) comes first
        assert_eq!(agents[0].id, "admin");
        assert_eq!(agents[0].status, "active");
        assert_eq!(agents[0].tier, 0);

        // Coder — status must be "active", NOT "You are a coder" (system_prompt)
        let coder = agents.iter().find(|a| a.id == "a1").unwrap();
        assert_eq!(coder.status, "active");
        assert_eq!(coder.name, "Coder");
        assert_eq!(coder.model, Some("claude-4".to_string()));

        // Reviewer — status must be "sleeping", NOT "You review code" (system_prompt)
        let reviewer = agents.iter().find(|a| a.id == "a2").unwrap();
        assert_eq!(reviewer.status, "sleeping");
        assert_eq!(reviewer.model, None);
    }

    #[test]
    fn test_get_agents_unread_count() {
        let conn = test_db();
        seed_agents(&conn);

        // Send 2 unread messages to a1
        conn.execute(
            "INSERT INTO messages (id, from_agent, to_agent, content, group_id, read) VALUES ('m1', 'a2', 'a1', 'hi', 'g1', 0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO messages (id, from_agent, to_agent, content, group_id, read) VALUES ('m2', 'admin', 'a1', 'task', 'g1', 0)",
            [],
        ).unwrap();
        // Send 1 read message to a1
        conn.execute(
            "INSERT INTO messages (id, from_agent, to_agent, content, group_id, read) VALUES ('m3', 'a2', 'a1', 'old', 'g1', 1)",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT a.*, (SELECT COUNT(*) FROM messages m WHERE m.to_agent = a.id AND m.read = 0) as unread_count \
             FROM agents a WHERE a.group_id = ? ORDER BY a.tier, a.role, a.name"
        ).unwrap();

        let agents: Vec<BtmsgAgent> = stmt.query_map(params!["g1"], |row| {
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
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        let coder = agents.iter().find(|a| a.id == "a1").unwrap();
        assert_eq!(coder.unread_count, 2);

        let reviewer = agents.iter().find(|a| a.id == "a2").unwrap();
        assert_eq!(reviewer.unread_count, 0);
    }

    // ---- REGRESSION: all_feed JOIN alias disambiguation ----
    // Bug: JOINed queries had duplicate "name" columns. Fixed with AS aliases.

    #[test]
    fn test_all_feed_returns_correct_sender_and_recipient_names() {
        let conn = test_db();
        seed_agents(&conn);

        conn.execute(
            "INSERT INTO messages (id, from_agent, to_agent, content, group_id) VALUES ('m1', 'a1', 'a2', 'review this', 'g1')",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT m.id, m.from_agent, m.to_agent, m.content, m.created_at, m.reply_to, \
             a1.name AS sender_name, a1.role AS sender_role, \
             a2.name AS recipient_name, a2.role AS recipient_role \
             FROM messages m \
             JOIN agents a1 ON m.from_agent = a1.id \
             JOIN agents a2 ON m.to_agent = a2.id \
             WHERE m.group_id = ? \
             ORDER BY m.created_at DESC LIMIT ?"
        ).unwrap();

        let msgs: Vec<BtmsgFeedMessage> = stmt.query_map(params!["g1", 100], |row| {
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
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].sender_name, "Coder");
        assert_eq!(msgs[0].sender_role, "developer");
        assert_eq!(msgs[0].recipient_name, "Reviewer");
        assert_eq!(msgs[0].recipient_role, "reviewer");
    }

    // ---- REGRESSION: unread_messages JOIN alias ----

    #[test]
    fn test_unread_messages_returns_sender_info() {
        let conn = test_db();
        seed_agents(&conn);

        conn.execute(
            "INSERT INTO messages (id, from_agent, to_agent, content, group_id, read) VALUES ('m1', 'a1', 'a2', 'check this', 'g1', 0)",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT m.id, m.from_agent, m.to_agent, m.content, m.read, m.reply_to, m.created_at, \
             a.name AS sender_name, a.role AS sender_role \
             FROM messages m JOIN agents a ON m.from_agent = a.id \
             WHERE m.to_agent = ? AND m.read = 0 ORDER BY m.created_at ASC"
        ).unwrap();

        let msgs: Vec<BtmsgMessage> = stmt.query_map(params!["a2"], |row| {
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
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].sender_name, Some("Coder".to_string()));
        assert_eq!(msgs[0].sender_role, Some("developer".to_string()));
        assert!(!msgs[0].read);
    }

    // ---- REGRESSION: channel_messages JOIN alias ----

    #[test]
    fn test_channel_messages_returns_sender_info() {
        let conn = test_db();
        seed_agents(&conn);

        conn.execute(
            "INSERT INTO channels (id, name, group_id, created_by) VALUES ('ch1', 'general', 'g1', 'admin')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO channel_members (channel_id, agent_id) VALUES ('ch1', 'a1')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO channel_messages (id, channel_id, from_agent, content) VALUES ('cm1', 'ch1', 'a1', 'hello channel')",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT cm.id, cm.channel_id, cm.from_agent, cm.content, cm.created_at, \
             a.name AS sender_name, a.role AS sender_role \
             FROM channel_messages cm JOIN agents a ON cm.from_agent = a.id \
             WHERE cm.channel_id = ? ORDER BY cm.created_at ASC LIMIT ?"
        ).unwrap();

        let msgs: Vec<BtmsgChannelMessage> = stmt.query_map(params!["ch1", 100], |row| {
            Ok(BtmsgChannelMessage {
                id: row.get("id")?,
                channel_id: row.get("channel_id")?,
                from_agent: row.get("from_agent")?,
                content: row.get("content")?,
                created_at: row.get("created_at")?,
                sender_name: row.get("sender_name")?,
                sender_role: row.get("sender_role")?,
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].sender_name, "Coder");
        assert_eq!(msgs[0].sender_role, "developer");
    }

    // ---- serde camelCase serialization ----

    #[test]
    fn test_btmsg_agent_serializes_to_camel_case() {
        let agent = BtmsgAgent {
            id: "a1".into(),
            name: "Test".into(),
            role: "dev".into(),
            group_id: "g1".into(),
            tier: 1,
            model: None,
            status: "active".into(),
            unread_count: 5,
        };

        let json = serde_json::to_value(&agent).unwrap();
        // Verify camelCase keys (matches TypeScript interface)
        assert!(json.get("groupId").is_some(), "expected camelCase 'groupId'");
        assert!(json.get("unreadCount").is_some(), "expected camelCase 'unreadCount'");
        assert!(json.get("group_id").is_none(), "should not have snake_case 'group_id'");
        assert!(json.get("unread_count").is_none(), "should not have snake_case 'unread_count'");
    }

    #[test]
    fn test_btmsg_message_serializes_to_camel_case() {
        let msg = BtmsgMessage {
            id: "m1".into(),
            from_agent: "a1".into(),
            to_agent: "a2".into(),
            content: "hi".into(),
            read: false,
            reply_to: None,
            created_at: "2026-01-01".into(),
            sender_name: Some("Coder".into()),
            sender_role: Some("dev".into()),
        };

        let json = serde_json::to_value(&msg).unwrap();
        assert!(json.get("fromAgent").is_some(), "expected camelCase 'fromAgent'");
        assert!(json.get("toAgent").is_some(), "expected camelCase 'toAgent'");
        assert!(json.get("replyTo").is_some(), "expected camelCase 'replyTo'");
        assert!(json.get("createdAt").is_some(), "expected camelCase 'createdAt'");
        assert!(json.get("senderName").is_some(), "expected camelCase 'senderName'");
        assert!(json.get("senderRole").is_some(), "expected camelCase 'senderRole'");
    }

    #[test]
    fn test_btmsg_feed_message_serializes_to_camel_case() {
        let msg = BtmsgFeedMessage {
            id: "m1".into(),
            from_agent: "a1".into(),
            to_agent: "a2".into(),
            content: "hi".into(),
            created_at: "2026-01-01".into(),
            reply_to: None,
            sender_name: "Coder".into(),
            sender_role: "dev".into(),
            recipient_name: "Reviewer".into(),
            recipient_role: "reviewer".into(),
        };

        let json = serde_json::to_value(&msg).unwrap();
        assert!(json.get("recipientName").is_some(), "expected camelCase 'recipientName'");
        assert!(json.get("recipientRole").is_some(), "expected camelCase 'recipientRole'");
    }
}
