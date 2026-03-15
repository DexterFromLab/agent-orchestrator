// Session metrics persistence (session_metrics table)

use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::SessionDb;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetric {
    #[serde(default)]
    pub id: i64,
    pub project_id: String,
    pub session_id: String,
    pub start_time: i64,
    pub end_time: i64,
    pub peak_tokens: i64,
    pub turn_count: i64,
    pub tool_call_count: i64,
    pub cost_usd: f64,
    pub model: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
}

impl SessionDb {
    pub fn save_session_metric(&self, metric: &SessionMetric) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO session_metrics (project_id, session_id, start_time, end_time, peak_tokens, turn_count, tool_call_count, cost_usd, model, status, error_message) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                metric.project_id,
                metric.session_id,
                metric.start_time,
                metric.end_time,
                metric.peak_tokens,
                metric.turn_count,
                metric.tool_call_count,
                metric.cost_usd,
                metric.model,
                metric.status,
                metric.error_message,
            ],
        ).map_err(|e| format!("Save session metric failed: {e}"))?;

        // Enforce retention: keep last 100 per project
        conn.execute(
            "DELETE FROM session_metrics WHERE project_id = ?1 AND id NOT IN (SELECT id FROM session_metrics WHERE project_id = ?1 ORDER BY end_time DESC LIMIT 100)",
            params![metric.project_id],
        ).map_err(|e| format!("Prune session metrics failed: {e}"))?;

        Ok(())
    }

    pub fn load_session_metrics(&self, project_id: &str, limit: i64) -> Result<Vec<SessionMetric>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, project_id, session_id, start_time, end_time, peak_tokens, turn_count, tool_call_count, cost_usd, model, status, error_message FROM session_metrics WHERE project_id = ?1 ORDER BY end_time DESC LIMIT ?2"
        ).map_err(|e| format!("Query prepare failed: {e}"))?;

        let metrics = stmt.query_map(params![project_id, limit], |row| {
            Ok(SessionMetric {
                id: row.get(0)?,
                project_id: row.get(1)?,
                session_id: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                peak_tokens: row.get(5)?,
                turn_count: row.get(6)?,
                tool_call_count: row.get(7)?,
                cost_usd: row.get(8)?,
                model: row.get(9)?,
                status: row.get(10)?,
                error_message: row.get(11)?,
            })
        }).map_err(|e| format!("Query failed: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Row read failed: {e}"))?;

        Ok(metrics)
    }
}
