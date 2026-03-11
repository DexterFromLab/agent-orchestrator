// Session anchor persistence (session_anchors table)

use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::SessionDb;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionAnchorRecord {
    pub id: String,
    pub project_id: String,
    pub message_id: String,
    pub anchor_type: String,
    pub content: String,
    pub estimated_tokens: i64,
    pub turn_index: i64,
    pub created_at: i64,
}

impl SessionDb {
    pub fn save_session_anchors(&self, anchors: &[SessionAnchorRecord]) -> Result<(), String> {
        if anchors.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "INSERT OR REPLACE INTO session_anchors (id, project_id, message_id, anchor_type, content, estimated_tokens, turn_index, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        ).map_err(|e| format!("Prepare anchor insert failed: {e}"))?;

        for anchor in anchors {
            stmt.execute(params![
                anchor.id,
                anchor.project_id,
                anchor.message_id,
                anchor.anchor_type,
                anchor.content,
                anchor.estimated_tokens,
                anchor.turn_index,
                anchor.created_at,
            ]).map_err(|e| format!("Insert anchor failed: {e}"))?;
        }
        Ok(())
    }

    pub fn load_session_anchors(&self, project_id: &str) -> Result<Vec<SessionAnchorRecord>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, message_id, anchor_type, content, estimated_tokens, turn_index, created_at FROM session_anchors WHERE project_id = ?1 ORDER BY turn_index ASC"
        ).map_err(|e| format!("Query anchors failed: {e}"))?;

        let anchors = stmt.query_map(params![project_id], |row| {
            Ok(SessionAnchorRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                message_id: row.get(2)?,
                anchor_type: row.get(3)?,
                content: row.get(4)?,
                estimated_tokens: row.get(5)?,
                turn_index: row.get(6)?,
                created_at: row.get(7)?,
            })
        }).map_err(|e| format!("Query anchors failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read anchor row failed: {e}"))?;

        Ok(anchors)
    }

    pub fn delete_session_anchor(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM session_anchors WHERE id = ?1", params![id])
            .map_err(|e| format!("Delete anchor failed: {e}"))?;
        Ok(())
    }

    pub fn delete_project_anchors(&self, project_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM session_anchors WHERE project_id = ?1", params![project_id])
            .map_err(|e| format!("Delete project anchors failed: {e}"))?;
        Ok(())
    }

    pub fn update_anchor_type(&self, id: &str, anchor_type: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE session_anchors SET anchor_type = ?2 WHERE id = ?1",
            params![id, anchor_type],
        ).map_err(|e| format!("Update anchor type failed: {e}"))?;
        Ok(())
    }
}
