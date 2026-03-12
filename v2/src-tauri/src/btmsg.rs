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
    conn.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()))
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

/// Default heartbeat staleness threshold: 5 minutes
const STALE_HEARTBEAT_SECS: i64 = 300;

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

    // Check if recipient is stale (no heartbeat in 5 min) — route to dead letter queue
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let cutoff = now - STALE_HEARTBEAT_SECS;

    let recipient_stale: bool = db
        .query_row(
            "SELECT COALESCE(h.timestamp, 0) < ?1 FROM agents a \
             LEFT JOIN heartbeats h ON a.id = h.agent_id \
             WHERE a.id = ?2",
            params![cutoff, to_agent],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if recipient_stale {
        // Queue to dead letter instead of delivering
        let error_msg = format!("Recipient '{}' is stale (no heartbeat in {} seconds)", to_agent, STALE_HEARTBEAT_SECS);
        db.execute(
            "INSERT INTO dead_letter_queue (from_agent, to_agent, content, error) VALUES (?1, ?2, ?3, ?4)",
            params![from_agent, to_agent, content, error_msg],
        )
        .map_err(|e| format!("Dead letter insert error: {e}"))?;

        // Also log audit event
        let _ = db.execute(
            "INSERT INTO audit_log (agent_id, event_type, detail) VALUES (?1, 'dead_letter', ?2)",
            params![from_agent, format!("Message to '{}' routed to dead letter queue: {}", to_agent, error_msg)],
        );

        return Err(error_msg);
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

/// Register all agents from groups.json into the btmsg database.
/// Creates/updates agent records and sets up contact permissions:
/// - All Tier 1 agents get bidirectional contacts with each other
/// - Manager gets contacts with ALL agents (Tier 1 + Tier 2)
/// - Other Tier 1 agents get contacts with Manager
/// Also ensures admin agent and review channels exist.
pub fn register_agents_from_groups(groups: &crate::groups::GroupsFile) -> Result<(), String> {
    for group in &groups.groups {
        register_group_agents(group)?;
    }
    Ok(())
}

/// Register all agents for a single group.
fn register_group_agents(group: &crate::groups::GroupConfig) -> Result<(), String> {
    let db = open_db_or_create()?;
    let group_id = &group.id;

    // Collect agent IDs by tier for contact setup
    let mut tier1_ids: Vec<String> = Vec::new();
    let mut tier2_ids: Vec<String> = Vec::new();
    let mut manager_id: Option<String> = None;

    // Register Tier 1 agents (from agents array)
    for agent in &group.agents {
        let tier = match agent.role.as_str() {
            "manager" | "architect" | "tester" | "reviewer" => 1,
            _ => 2,
        };
        upsert_agent(
            &db,
            &agent.id,
            &agent.name,
            &agent.role,
            group_id,
            tier,
            agent.model.as_deref(),
            agent.cwd.as_deref(),
            agent.system_prompt.as_deref(),
        )?;
        if tier == 1 {
            tier1_ids.push(agent.id.clone());
            if agent.role == "manager" {
                manager_id = Some(agent.id.clone());
            }
        } else {
            tier2_ids.push(agent.id.clone());
        }
    }

    // Register Tier 2 agents (from projects array)
    for project in &group.projects {
        upsert_agent(
            &db,
            &project.id,
            &project.name,
            "project",
            group_id,
            2,
            None,
            Some(&project.cwd),
            None,
        )?;
        tier2_ids.push(project.id.clone());
    }

    // Set up contact permissions

    // All Tier 1 agents: bidirectional contacts with each other
    for i in 0..tier1_ids.len() {
        for j in (i + 1)..tier1_ids.len() {
            db.execute(
                "INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES (?1, ?2)",
                params![tier1_ids[i], tier1_ids[j]],
            ).map_err(|e| format!("Contact insert error: {e}"))?;
            db.execute(
                "INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES (?1, ?2)",
                params![tier1_ids[j], tier1_ids[i]],
            ).map_err(|e| format!("Contact insert error: {e}"))?;
        }
    }

    // Manager gets contacts with ALL Tier 2 agents (bidirectional)
    if let Some(ref mgr_id) = manager_id {
        for t2_id in &tier2_ids {
            db.execute(
                "INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES (?1, ?2)",
                params![mgr_id, t2_id],
            ).map_err(|e| format!("Contact insert error: {e}"))?;
            db.execute(
                "INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES (?1, ?2)",
                params![t2_id, mgr_id],
            ).map_err(|e| format!("Contact insert error: {e}"))?;
        }
    }

    // Ensure review channels exist
    ensure_review_channels_for_group(&db, group_id);

    // Drop the connection before calling ensure_admin (which opens its own)
    drop(db);

    // Ensure admin agent exists with contacts to all agents
    let _ = ensure_admin(group_id);

    Ok(())
}

fn upsert_agent(
    db: &Connection,
    id: &str,
    name: &str,
    role: &str,
    group_id: &str,
    tier: i32,
    model: Option<&str>,
    cwd: Option<&str>,
    system_prompt: Option<&str>,
) -> Result<(), String> {
    db.execute(
        "INSERT INTO agents (id, name, role, group_id, tier, model, cwd, system_prompt)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            role = excluded.role,
            group_id = excluded.group_id,
            tier = excluded.tier,
            model = excluded.model,
            cwd = excluded.cwd,
            system_prompt = excluded.system_prompt",
        params![id, name, role, group_id, tier, model, cwd, system_prompt],
    )
    .map_err(|e| format!("Upsert agent error: {e}"))?;
    Ok(())
}

/// Ensure #review-queue and #review-log channels exist for a group (public wrapper).
fn ensure_review_channels_for_group(db: &Connection, group_id: &str) {
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
}

/// Open btmsg database, creating it with schema if it doesn't exist.
fn open_db_or_create() -> Result<Connection, String> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create data dir: {e}"))?;
    }

    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .map_err(|e| format!("Failed to open/create btmsg.db: {e}"))?;

    conn.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()))
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;
    conn.pragma_update(None, "busy_timeout", 5000)
        .map_err(|e| format!("Failed to set busy_timeout: {e}"))?;

    // Create tables if they don't exist (same schema as Python btmsg CLI)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            group_id TEXT NOT NULL,
            tier INTEGER NOT NULL DEFAULT 2,
            model TEXT,
            cwd TEXT,
            system_prompt TEXT,
            status TEXT DEFAULT 'stopped',
            last_active_at TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS contacts (
            agent_id TEXT NOT NULL,
            contact_id TEXT NOT NULL,
            PRIMARY KEY (agent_id, contact_id),
            FOREIGN KEY (agent_id) REFERENCES agents(id),
            FOREIGN KEY (contact_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            from_agent TEXT NOT NULL,
            to_agent TEXT NOT NULL,
            content TEXT NOT NULL,
            read INTEGER DEFAULT 0,
            reply_to TEXT,
            group_id TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (from_agent) REFERENCES agents(id),
            FOREIGN KEY (to_agent) REFERENCES agents(id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_agent, read);
        CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_agent);
        CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id);
        CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to);

        CREATE TABLE IF NOT EXISTS channels (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            group_id TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS channel_members (
            channel_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            joined_at TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (channel_id, agent_id),
            FOREIGN KEY (channel_id) REFERENCES channels(id),
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS channel_messages (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            from_agent TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (channel_id) REFERENCES channels(id),
            FOREIGN KEY (from_agent) REFERENCES agents(id)
        );

        CREATE INDEX IF NOT EXISTS idx_channel_messages ON channel_messages(channel_id, created_at);

        CREATE TABLE IF NOT EXISTS tasks (
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
            FOREIGN KEY (assigned_to) REFERENCES agents(id),
            FOREIGN KEY (created_by) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS task_comments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id),
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
        CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

        CREATE TABLE IF NOT EXISTS heartbeats (
            agent_id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE TABLE IF NOT EXISTS dead_letter_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_agent TEXT NOT NULL,
            to_agent TEXT NOT NULL,
            content TEXT NOT NULL,
            error TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (from_agent) REFERENCES agents(id),
            FOREIGN KEY (to_agent) REFERENCES agents(id)
        );

        CREATE INDEX IF NOT EXISTS idx_dead_letter_from ON dead_letter_queue(from_agent);
        CREATE INDEX IF NOT EXISTS idx_dead_letter_to ON dead_letter_queue(to_agent);

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agent_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (agent_id) REFERENCES agents(id)
        );

        CREATE INDEX IF NOT EXISTS idx_audit_log_agent ON audit_log(agent_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_type ON audit_log(event_type);"
    ).map_err(|e| format!("Schema creation error: {e}"))?;

    Ok(conn)
}

// ---- Heartbeat monitoring ----

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHeartbeat {
    pub agent_id: String,
    pub agent_name: String,
    pub agent_role: String,
    pub timestamp: i64,
}

pub fn record_heartbeat(agent_id: &str) -> Result<(), String> {
    let db = open_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Time error: {e}"))?
        .as_secs() as i64;
    db.execute(
        "INSERT INTO heartbeats (agent_id, timestamp) VALUES (?1, ?2) \
         ON CONFLICT(agent_id) DO UPDATE SET timestamp = excluded.timestamp",
        params![agent_id, now],
    )
    .map_err(|e| format!("Heartbeat upsert error: {e}"))?;
    Ok(())
}

pub fn get_agent_heartbeats(group_id: &str) -> Result<Vec<AgentHeartbeat>, String> {
    let db = open_db()?;
    let mut stmt = db
        .prepare(
            "SELECT h.agent_id, a.name AS agent_name, a.role AS agent_role, h.timestamp \
             FROM heartbeats h JOIN agents a ON h.agent_id = a.id \
             WHERE a.group_id = ? ORDER BY h.timestamp DESC",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(params![group_id], |row| {
            Ok(AgentHeartbeat {
                agent_id: row.get("agent_id")?,
                agent_name: row.get("agent_name")?,
                agent_role: row.get("agent_role")?,
                timestamp: row.get("timestamp")?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

pub fn get_stale_agents(group_id: &str, threshold_secs: i64) -> Result<Vec<String>, String> {
    let db = open_db()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Time error: {e}"))?
        .as_secs() as i64;
    let cutoff = now - threshold_secs;

    // Agents in the group that either have no heartbeat or heartbeat older than cutoff
    let mut stmt = db
        .prepare(
            "SELECT a.id FROM agents a LEFT JOIN heartbeats h ON a.id = h.agent_id \
             WHERE a.group_id = ? AND a.tier > 0 AND (h.timestamp IS NULL OR h.timestamp < ?)",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let ids = stmt
        .query_map(params![group_id, cutoff], |row| row.get::<_, String>(0))
        .map_err(|e| format!("Query error: {e}"))?;

    ids.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

// ---- Dead letter queue ----

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeadLetter {
    pub id: i64,
    pub from_agent: String,
    pub to_agent: String,
    pub content: String,
    pub error: String,
    pub created_at: String,
}

pub fn queue_dead_letter(
    from_agent: &str,
    to_agent: &str,
    content: &str,
    error: &str,
) -> Result<(), String> {
    let db = open_db()?;
    db.execute(
        "INSERT INTO dead_letter_queue (from_agent, to_agent, content, error) VALUES (?1, ?2, ?3, ?4)",
        params![from_agent, to_agent, content, error],
    )
    .map_err(|e| format!("Dead letter insert error: {e}"))?;
    Ok(())
}

pub fn get_dead_letters(group_id: &str, limit: i32) -> Result<Vec<DeadLetter>, String> {
    let db = open_db()?;
    let mut stmt = db
        .prepare(
            "SELECT d.id, d.from_agent, d.to_agent, d.content, d.error, d.created_at \
             FROM dead_letter_queue d \
             JOIN agents a ON d.to_agent = a.id \
             WHERE a.group_id = ? \
             ORDER BY d.created_at DESC LIMIT ?",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(params![group_id, limit], |row| {
            Ok(DeadLetter {
                id: row.get("id")?,
                from_agent: row.get("from_agent")?,
                to_agent: row.get("to_agent")?,
                content: row.get("content")?,
                error: row.get("error")?,
                created_at: row.get("created_at")?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

pub fn clear_dead_letters(group_id: &str) -> Result<(), String> {
    let db = open_db()?;
    db.execute(
        "DELETE FROM dead_letter_queue WHERE to_agent IN (SELECT id FROM agents WHERE group_id = ?)",
        params![group_id],
    )
    .map_err(|e| format!("Delete error: {e}"))?;
    Ok(())
}

// ---- Audit log ----

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: i64,
    pub agent_id: String,
    pub event_type: String,
    pub detail: String,
    pub created_at: String,
}

pub fn log_audit_event(agent_id: &str, event_type: &str, detail: &str) -> Result<(), String> {
    let db = open_db_or_create()?;
    db.execute(
        "INSERT INTO audit_log (agent_id, event_type, detail) VALUES (?1, ?2, ?3)",
        params![agent_id, event_type, detail],
    )
    .map_err(|e| format!("Audit log insert error: {e}"))?;
    Ok(())
}

pub fn get_audit_log(group_id: &str, limit: i32, offset: i32) -> Result<Vec<AuditEntry>, String> {
    let db = open_db()?;
    let mut stmt = db
        .prepare(
            "SELECT al.id, al.agent_id, al.event_type, al.detail, al.created_at \
             FROM audit_log al \
             JOIN agents a ON al.agent_id = a.id \
             WHERE a.group_id = ? \
             ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(params![group_id, limit, offset], |row| {
            Ok(AuditEntry {
                id: row.get("id")?,
                agent_id: row.get("agent_id")?,
                event_type: row.get("event_type")?,
                detail: row.get("detail")?,
                created_at: row.get("created_at")?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
}

pub fn get_audit_log_for_agent(
    agent_id: &str,
    limit: i32,
) -> Result<Vec<AuditEntry>, String> {
    let db = open_db()?;
    let mut stmt = db
        .prepare(
            "SELECT id, agent_id, event_type, detail, created_at \
             FROM audit_log WHERE agent_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let rows = stmt
        .query_map(params![agent_id, limit], |row| {
            Ok(AuditEntry {
                id: row.get("id")?,
                agent_id: row.get("agent_id")?,
                event_type: row.get("event_type")?,
                detail: row.get("detail")?,
                created_at: row.get("created_at")?,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row error: {e}"))
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
            );
            CREATE TABLE heartbeats (
                agent_id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL
            );
            CREATE TABLE dead_letter_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_agent TEXT NOT NULL,
                to_agent TEXT NOT NULL,
                content TEXT NOT NULL,
                error TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                detail TEXT NOT NULL,
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

    // ---- Agent registration tests ----

    #[test]
    fn test_upsert_agent_inserts_new() {
        let conn = test_db();
        upsert_agent(&conn, "mgr1", "Manager", "manager", "g1", 1, Some("claude-4"), None, Some("You manage")).unwrap();

        let agent = conn.query_row(
            "SELECT * FROM agents WHERE id = 'mgr1'", [],
            |row| Ok((
                row.get::<_, String>("name").unwrap(),
                row.get::<_, String>("role").unwrap(),
                row.get::<_, i32>("tier").unwrap(),
                row.get::<_, Option<String>>("model").unwrap(),
                row.get::<_, Option<String>>("system_prompt").unwrap(),
            )),
        ).unwrap();
        assert_eq!(agent.0, "Manager");
        assert_eq!(agent.1, "manager");
        assert_eq!(agent.2, 1);
        assert_eq!(agent.3, Some("claude-4".to_string()));
        assert_eq!(agent.4, Some("You manage".to_string()));
    }

    #[test]
    fn test_upsert_agent_updates_existing() {
        let conn = test_db();
        upsert_agent(&conn, "a1", "OldName", "manager", "g1", 1, None, None, None).unwrap();
        upsert_agent(&conn, "a1", "NewName", "architect", "g1", 1, Some("model-x"), None, None).unwrap();

        let (name, role, model): (String, String, Option<String>) = conn.query_row(
            "SELECT name, role, model FROM agents WHERE id = 'a1'", [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(name, "NewName");
        assert_eq!(role, "architect");
        assert_eq!(model, Some("model-x".to_string()));
    }

    #[test]
    fn test_ensure_review_channels_for_group_creates_both() {
        let conn = test_db();
        ensure_review_channels_for_group(&conn, "g1");

        let queue: i64 = conn.query_row(
            "SELECT COUNT(*) FROM channels WHERE name = 'review-queue' AND group_id = 'g1'",
            [], |row| row.get(0),
        ).unwrap();
        let log: i64 = conn.query_row(
            "SELECT COUNT(*) FROM channels WHERE name = 'review-log' AND group_id = 'g1'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(queue, 1);
        assert_eq!(log, 1);

        // Idempotent
        ensure_review_channels_for_group(&conn, "g1");
        let queue2: i64 = conn.query_row(
            "SELECT COUNT(*) FROM channels WHERE name = 'review-queue' AND group_id = 'g1'",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(queue2, 1);
    }

    #[test]
    fn test_upsert_preserves_status() {
        let conn = test_db();
        upsert_agent(&conn, "a1", "Agent", "manager", "g1", 1, None, None, None).unwrap();

        // Manually set status to 'active'
        conn.execute("UPDATE agents SET status = 'active' WHERE id = 'a1'", []).unwrap();

        // Upsert should NOT overwrite status (ON CONFLICT only updates name/role/etc)
        upsert_agent(&conn, "a1", "Agent Updated", "manager", "g1", 1, None, None, None).unwrap();

        let status: String = conn.query_row(
            "SELECT status FROM agents WHERE id = 'a1'", [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(status, "active", "upsert should preserve existing status");
    }

    // ---- Heartbeat tests ----

    #[test]
    fn test_heartbeat_upsert_and_query() {
        let conn = test_db();
        seed_agents(&conn);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // Insert heartbeat for a1
        conn.execute(
            "INSERT INTO heartbeats (agent_id, timestamp) VALUES ('a1', ?1) \
             ON CONFLICT(agent_id) DO UPDATE SET timestamp = excluded.timestamp",
            params![now],
        ).unwrap();

        // Query heartbeats for group
        let mut stmt = conn.prepare(
            "SELECT h.agent_id, a.name AS agent_name, a.role AS agent_role, h.timestamp \
             FROM heartbeats h JOIN agents a ON h.agent_id = a.id \
             WHERE a.group_id = ? ORDER BY h.timestamp DESC"
        ).unwrap();

        let heartbeats: Vec<AgentHeartbeat> = stmt.query_map(params!["g1"], |row| {
            Ok(AgentHeartbeat {
                agent_id: row.get("agent_id")?,
                agent_name: row.get("agent_name")?,
                agent_role: row.get("agent_role")?,
                timestamp: row.get("timestamp")?,
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(heartbeats.len(), 1);
        assert_eq!(heartbeats[0].agent_id, "a1");
        assert_eq!(heartbeats[0].agent_name, "Coder");
        assert_eq!(heartbeats[0].timestamp, now);

        // Upsert overwrites
        let later = now + 10;
        conn.execute(
            "INSERT INTO heartbeats (agent_id, timestamp) VALUES ('a1', ?1) \
             ON CONFLICT(agent_id) DO UPDATE SET timestamp = excluded.timestamp",
            params![later],
        ).unwrap();

        let ts: i64 = conn.query_row(
            "SELECT timestamp FROM heartbeats WHERE agent_id = 'a1'", [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(ts, later);
    }

    #[test]
    fn test_stale_agents_detection() {
        let conn = test_db();
        seed_agents(&conn);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        // a1 has a recent heartbeat, a2 has a stale one
        conn.execute("INSERT INTO heartbeats (agent_id, timestamp) VALUES ('a1', ?)", params![now]).unwrap();
        conn.execute("INSERT INTO heartbeats (agent_id, timestamp) VALUES ('a2', ?)", params![now - 600]).unwrap();

        // Stale threshold: 300 seconds
        let cutoff = now - 300;
        let mut stmt = conn.prepare(
            "SELECT a.id FROM agents a LEFT JOIN heartbeats h ON a.id = h.agent_id \
             WHERE a.group_id = ? AND a.tier > 0 AND (h.timestamp IS NULL OR h.timestamp < ?)"
        ).unwrap();

        let stale: Vec<String> = stmt.query_map(params!["g1", cutoff], |row| {
            row.get::<_, String>(0)
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(stale.len(), 1);
        assert_eq!(stale[0], "a2");
    }

    // ---- Dead letter queue tests ----

    #[test]
    fn test_dead_letter_queue_insert_and_query() {
        let conn = test_db();
        seed_agents(&conn);

        conn.execute(
            "INSERT INTO dead_letter_queue (from_agent, to_agent, content, error) VALUES ('a1', 'a2', 'hello', 'stale')",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT d.id, d.from_agent, d.to_agent, d.content, d.error, d.created_at \
             FROM dead_letter_queue d JOIN agents a ON d.to_agent = a.id \
             WHERE a.group_id = ? ORDER BY d.created_at DESC LIMIT 50"
        ).unwrap();

        let letters: Vec<DeadLetter> = stmt.query_map(params!["g1"], |row| {
            Ok(DeadLetter {
                id: row.get("id")?,
                from_agent: row.get("from_agent")?,
                to_agent: row.get("to_agent")?,
                content: row.get("content")?,
                error: row.get("error")?,
                created_at: row.get("created_at")?,
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(letters.len(), 1);
        assert_eq!(letters[0].from_agent, "a1");
        assert_eq!(letters[0].to_agent, "a2");
        assert_eq!(letters[0].content, "hello");
        assert_eq!(letters[0].error, "stale");
    }

    #[test]
    fn test_dead_letter_clear() {
        let conn = test_db();
        seed_agents(&conn);

        conn.execute(
            "INSERT INTO dead_letter_queue (from_agent, to_agent, content, error) VALUES ('a1', 'a2', 'msg', 'err')",
            [],
        ).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dead_letter_queue", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 1);

        conn.execute(
            "DELETE FROM dead_letter_queue WHERE to_agent IN (SELECT id FROM agents WHERE group_id = ?)",
            params!["g1"],
        ).unwrap();

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM dead_letter_queue", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 0);
    }

    // ---- Audit log tests ----

    #[test]
    fn test_audit_log_insert_and_query() {
        let conn = test_db();
        seed_agents(&conn);

        conn.execute(
            "INSERT INTO audit_log (agent_id, event_type, detail) VALUES ('a1', 'status_change', 'Started running')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO audit_log (agent_id, event_type, detail) VALUES ('a1', 'wake_event', 'Auto-wake triggered')",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT al.id, al.agent_id, al.event_type, al.detail, al.created_at \
             FROM audit_log al JOIN agents a ON al.agent_id = a.id \
             WHERE a.group_id = ? ORDER BY al.created_at DESC, al.id DESC LIMIT ? OFFSET ?"
        ).unwrap();

        let entries: Vec<AuditEntry> = stmt.query_map(params!["g1", 50, 0], |row| {
            Ok(AuditEntry {
                id: row.get("id")?,
                agent_id: row.get("agent_id")?,
                event_type: row.get("event_type")?,
                detail: row.get("detail")?,
                created_at: row.get("created_at")?,
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(entries.len(), 2);
        // Reverse chronological (by id tiebreaker) — most recent first
        assert_eq!(entries[0].event_type, "wake_event");
        assert_eq!(entries[1].event_type, "status_change");
    }

    #[test]
    fn test_audit_log_for_agent() {
        let conn = test_db();
        seed_agents(&conn);

        conn.execute(
            "INSERT INTO audit_log (agent_id, event_type, detail) VALUES ('a1', 'status_change', 'started')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO audit_log (agent_id, event_type, detail) VALUES ('a2', 'btmsg_sent', 'sent msg')",
            [],
        ).unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, agent_id, event_type, detail, created_at \
             FROM audit_log WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?"
        ).unwrap();

        let entries: Vec<AuditEntry> = stmt.query_map(params!["a1", 50], |row| {
            Ok(AuditEntry {
                id: row.get("id")?,
                agent_id: row.get("agent_id")?,
                event_type: row.get("event_type")?,
                detail: row.get("detail")?,
                created_at: row.get("created_at")?,
            })
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].agent_id, "a1");
        assert_eq!(entries[0].event_type, "status_change");
    }

    #[test]
    fn test_agent_heartbeat_serializes_to_camel_case() {
        let hb = AgentHeartbeat {
            agent_id: "a1".into(),
            agent_name: "Coder".into(),
            agent_role: "developer".into(),
            timestamp: 1234567890,
        };
        let json = serde_json::to_value(&hb).unwrap();
        assert!(json.get("agentId").is_some(), "expected camelCase 'agentId'");
        assert!(json.get("agentName").is_some(), "expected camelCase 'agentName'");
        assert!(json.get("agentRole").is_some(), "expected camelCase 'agentRole'");
        assert!(json.get("agent_id").is_none(), "should not have snake_case 'agent_id'");
    }

    #[test]
    fn test_dead_letter_serializes_to_camel_case() {
        let dl = DeadLetter {
            id: 1,
            from_agent: "a1".into(),
            to_agent: "a2".into(),
            content: "hello".into(),
            error: "stale".into(),
            created_at: "2026-01-01".into(),
        };
        let json = serde_json::to_value(&dl).unwrap();
        assert!(json.get("fromAgent").is_some(), "expected camelCase 'fromAgent'");
        assert!(json.get("toAgent").is_some(), "expected camelCase 'toAgent'");
        assert!(json.get("createdAt").is_some(), "expected camelCase 'createdAt'");
    }

    #[test]
    fn test_audit_entry_serializes_to_camel_case() {
        let entry = AuditEntry {
            id: 1,
            agent_id: "a1".into(),
            event_type: "status_change".into(),
            detail: "started".into(),
            created_at: "2026-01-01".into(),
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert!(json.get("agentId").is_some(), "expected camelCase 'agentId'");
        assert!(json.get("eventType").is_some(), "expected camelCase 'eventType'");
        assert!(json.get("createdAt").is_some(), "expected camelCase 'createdAt'");
        assert!(json.get("agent_id").is_none(), "should not have snake_case");
    }

    #[test]
    fn test_contact_permissions_bidirectional() {
        let conn = test_db();
        upsert_agent(&conn, "mgr", "Manager", "manager", "g1", 1, None, None, None).unwrap();
        upsert_agent(&conn, "arch", "Architect", "architect", "g1", 1, None, None, None).unwrap();

        // Set up bidirectional contacts (simulating what register_group_agents does)
        conn.execute("INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES ('mgr', 'arch')", []).unwrap();
        conn.execute("INSERT OR IGNORE INTO contacts (agent_id, contact_id) VALUES ('arch', 'mgr')", []).unwrap();

        let fwd: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM contacts WHERE agent_id = 'mgr' AND contact_id = 'arch'",
            [], |row| row.get(0),
        ).unwrap();
        let rev: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM contacts WHERE agent_id = 'arch' AND contact_id = 'mgr'",
            [], |row| row.get(0),
        ).unwrap();
        assert!(fwd, "forward contact should exist");
        assert!(rev, "reverse contact should exist");
    }
}
