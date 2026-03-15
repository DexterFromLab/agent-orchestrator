// Agent message and project state persistence (agent_messages + project_agent_state tables)

use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::SessionDb;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessageRecord {
    #[serde(default)]
    pub id: i64,
    pub session_id: String,
    pub project_id: String,
    pub sdk_session_id: Option<String>,
    pub message_type: String,
    pub content: String,
    pub parent_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAgentState {
    pub project_id: String,
    pub last_session_id: String,
    pub sdk_session_id: Option<String>,
    pub status: String,
    pub cost_usd: f64,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub last_prompt: Option<String>,
    pub updated_at: i64,
}

impl SessionDb {
    pub fn save_agent_messages(
        &self,
        session_id: &str,
        project_id: &str,
        sdk_session_id: Option<&str>,
        messages: &[AgentMessageRecord],
    ) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        // Wrap DELETE+INSERTs in a transaction to prevent partial writes on crash
        let tx = conn.unchecked_transaction()
            .map_err(|e| format!("Begin transaction failed: {e}"))?;

        // Clear previous messages for this session
        tx.execute(
            "DELETE FROM agent_messages WHERE session_id = ?1",
            params![session_id],
        ).map_err(|e| format!("Delete old messages failed: {e}"))?;

        let mut stmt = tx.prepare(
            "INSERT INTO agent_messages (session_id, project_id, sdk_session_id, message_type, content, parent_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).map_err(|e| format!("Prepare insert failed: {e}"))?;

        for msg in messages {
            stmt.execute(params![
                session_id,
                project_id,
                sdk_session_id,
                msg.message_type,
                msg.content,
                msg.parent_id,
                msg.created_at,
            ]).map_err(|e| format!("Insert message failed: {e}"))?;
        }
        drop(stmt);
        tx.commit().map_err(|e| format!("Commit failed: {e}"))?;
        Ok(())
    }

    pub fn load_agent_messages(&self, project_id: &str) -> Result<Vec<AgentMessageRecord>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, session_id, project_id, sdk_session_id, message_type, content, parent_id, created_at
             FROM agent_messages
             WHERE project_id = ?1
             ORDER BY created_at ASC"
        ).map_err(|e| format!("Query prepare failed: {e}"))?;

        let messages = stmt.query_map(params![project_id], |row| {
            Ok(AgentMessageRecord {
                id: row.get(0)?,
                session_id: row.get(1)?,
                project_id: row.get(2)?,
                sdk_session_id: row.get(3)?,
                message_type: row.get(4)?,
                content: row.get(5)?,
                parent_id: row.get(6)?,
                created_at: row.get(7)?,
            })
        }).map_err(|e| format!("Query failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {e}"))?;

        Ok(messages)
    }

    pub fn save_project_agent_state(&self, state: &ProjectAgentState) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO project_agent_state (project_id, last_session_id, sdk_session_id, status, cost_usd, input_tokens, output_tokens, last_prompt, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                state.project_id,
                state.last_session_id,
                state.sdk_session_id,
                state.status,
                state.cost_usd,
                state.input_tokens,
                state.output_tokens,
                state.last_prompt,
                state.updated_at,
            ],
        ).map_err(|e| format!("Save project agent state failed: {e}"))?;
        Ok(())
    }

    pub fn load_project_agent_state(&self, project_id: &str) -> Result<Option<ProjectAgentState>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT project_id, last_session_id, sdk_session_id, status, cost_usd, input_tokens, output_tokens, last_prompt, updated_at FROM project_agent_state WHERE project_id = ?1"
        ).map_err(|e| format!("Query prepare failed: {e}"))?;

        let result = stmt.query_row(params![project_id], |row| {
            Ok(ProjectAgentState {
                project_id: row.get(0)?,
                last_session_id: row.get(1)?,
                sdk_session_id: row.get(2)?,
                status: row.get(3)?,
                cost_usd: row.get(4)?,
                input_tokens: row.get(5)?,
                output_tokens: row.get(6)?,
                last_prompt: row.get(7)?,
                updated_at: row.get(8)?,
            })
        });

        match result {
            Ok(state) => Ok(Some(state)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Load project agent state failed: {e}")),
        }
    }
}
