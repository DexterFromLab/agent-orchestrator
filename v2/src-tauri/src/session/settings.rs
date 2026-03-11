// Settings persistence (settings table)

use rusqlite::params;
use super::SessionDb;

impl SessionDb {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT value FROM settings WHERE key = ?1")
            .map_err(|e| format!("Settings query failed: {e}"))?;
        let result = stmt.query_row(params![key], |row| row.get(0));
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Settings read failed: {e}")),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|e| format!("Settings write failed: {e}"))?;
        Ok(())
    }

    pub fn get_all_settings(&self) -> Result<Vec<(String, String)>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings ORDER BY key")
            .map_err(|e| format!("Settings query failed: {e}"))?;
        let settings = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| format!("Settings query failed: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Settings read failed: {e}"))?;
        Ok(settings)
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
    fn test_get_setting_missing_returns_none() {
        let db = make_db();
        let val = db.get_setting("nonexistent").unwrap();
        assert!(val.is_none());
    }

    #[test]
    fn test_set_and_get_setting() {
        let db = make_db();
        db.set_setting("theme", "mocha").unwrap();
        let val = db.get_setting("theme").unwrap();
        assert_eq!(val, Some("mocha".to_string()));
    }

    #[test]
    fn test_set_setting_overwrites() {
        let db = make_db();
        db.set_setting("font_size", "12").unwrap();
        db.set_setting("font_size", "14").unwrap();
        assert_eq!(db.get_setting("font_size").unwrap(), Some("14".to_string()));
    }

    #[test]
    fn test_get_all_settings() {
        let db = make_db();
        db.set_setting("b_key", "val_b").unwrap();
        db.set_setting("a_key", "val_a").unwrap();

        let all = db.get_all_settings().unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].0, "a_key");
        assert_eq!(all[1].0, "b_key");
    }

    #[test]
    fn test_get_all_settings_empty() {
        let db = make_db();
        let all = db.get_all_settings().unwrap();
        assert!(all.is_empty());
    }
}
