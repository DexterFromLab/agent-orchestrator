// Layout state persistence (layout_state table)

use rusqlite::params;
use serde::{Deserialize, Serialize};
use super::SessionDb;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutState {
    pub preset: String,
    pub pane_ids: Vec<String>,
}

impl SessionDb {
    pub fn save_layout(&self, layout: &LayoutState) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        let pane_ids_json = serde_json::to_string(&layout.pane_ids)
            .map_err(|e| format!("Serialize pane_ids failed: {e}"))?;
        conn.execute(
            "UPDATE layout_state SET preset = ?1, pane_ids = ?2 WHERE id = 1",
            params![layout.preset, pane_ids_json],
        ).map_err(|e| format!("Layout save failed: {e}"))?;
        Ok(())
    }

    pub fn load_layout(&self) -> Result<LayoutState, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT preset, pane_ids FROM layout_state WHERE id = 1")
            .map_err(|e| format!("Layout query failed: {e}"))?;

        stmt.query_row([], |row| {
            let preset: String = row.get(0)?;
            let pane_ids_json: String = row.get(1)?;
            let pane_ids: Vec<String> = serde_json::from_str(&pane_ids_json).unwrap_or_default();
            Ok(LayoutState { preset, pane_ids })
        }).map_err(|e| format!("Layout read failed: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_db() -> SessionDb {
        let dir = tempfile::tempdir().unwrap();
        SessionDb::open(&dir.path().to_path_buf()).unwrap()
    }

    #[test]
    fn test_load_default_layout() {
        let db = make_db();
        let layout = db.load_layout().unwrap();
        assert_eq!(layout.preset, "1-col");
        assert!(layout.pane_ids.is_empty());
    }

    #[test]
    fn test_save_and_load_layout() {
        let db = make_db();
        let layout = LayoutState {
            preset: "2-col".to_string(),
            pane_ids: vec!["p1".to_string(), "p2".to_string()],
        };
        db.save_layout(&layout).unwrap();

        let loaded = db.load_layout().unwrap();
        assert_eq!(loaded.preset, "2-col");
        assert_eq!(loaded.pane_ids, vec!["p1", "p2"]);
    }

    #[test]
    fn test_save_layout_overwrites() {
        let db = make_db();
        let layout1 = LayoutState {
            preset: "2-col".to_string(),
            pane_ids: vec!["p1".to_string()],
        };
        db.save_layout(&layout1).unwrap();

        let layout2 = LayoutState {
            preset: "3-col".to_string(),
            pane_ids: vec!["a".to_string(), "b".to_string(), "c".to_string()],
        };
        db.save_layout(&layout2).unwrap();

        let loaded = db.load_layout().unwrap();
        assert_eq!(loaded.preset, "3-col");
        assert_eq!(loaded.pane_ids.len(), 3);
    }
}
