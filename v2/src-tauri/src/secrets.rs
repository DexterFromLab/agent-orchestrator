//! Secrets management via system keyring (libsecret on Linux).
//!
//! Stores secrets in the OS keyring (GNOME Keyring / KDE Wallet).
//! A metadata entry "__bterminal_keys__" tracks known key names.
//! If the keyring is unavailable, operations return explicit errors
//! rather than falling back to plaintext storage.

use keyring::Entry;

const SERVICE: &str = "bterminal";
const KEYS_META: &str = "__bterminal_keys__";

/// Known secret key identifiers.
pub const KNOWN_KEYS: &[&str] = &[
    "anthropic_api_key",
    "openai_api_key",
    "openrouter_api_key",
    "github_token",
    "relay_token",
];

pub struct SecretsManager;

impl SecretsManager {
    /// Store a secret value in the system keyring.
    pub fn store_secret(key: &str, value: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE, key).map_err(|e| format!("keyring init error: {e}"))?;
        entry
            .set_password(value)
            .map_err(|e| format!("failed to store secret '{key}': {e}"))?;

        // Track the key in metadata
        Self::add_key_to_meta(key)?;
        Ok(())
    }

    /// Retrieve a secret value from the system keyring.
    /// Returns Ok(None) if the key does not exist.
    pub fn get_secret(key: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(SERVICE, key).map_err(|e| format!("keyring init error: {e}"))?;
        match entry.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("failed to get secret '{key}': {e}")),
        }
    }

    /// Delete a secret from the system keyring.
    pub fn delete_secret(key: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE, key).map_err(|e| format!("keyring init error: {e}"))?;
        match entry.delete_credential() {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {} // already absent, not an error
            Err(e) => return Err(format!("failed to delete secret '{key}': {e}")),
        }

        Self::remove_key_from_meta(key)?;
        Ok(())
    }

    /// List keys that have been stored (read from metadata entry).
    pub fn list_keys() -> Result<Vec<String>, String> {
        let entry =
            Entry::new(SERVICE, KEYS_META).map_err(|e| format!("keyring init error: {e}"))?;
        match entry.get_password() {
            Ok(raw) => {
                let keys: Vec<String> = raw
                    .split('\n')
                    .filter(|s| !s.is_empty())
                    .map(String::from)
                    .collect();
                Ok(keys)
            }
            Err(keyring::Error::NoEntry) => Ok(Vec::new()),
            Err(e) => Err(format!("failed to list secret keys: {e}")),
        }
    }

    /// Check whether the system keyring is available.
    pub fn has_keyring() -> bool {
        // Attempt to create an entry — this is the cheapest probe.
        Entry::new(SERVICE, "__probe__").is_ok()
    }

    // --- internal helpers ---

    fn add_key_to_meta(key: &str) -> Result<(), String> {
        let mut keys = Self::list_keys().unwrap_or_default();
        if !keys.iter().any(|k| k == key) {
            keys.push(key.to_string());
            Self::save_meta(&keys)?;
        }
        Ok(())
    }

    fn remove_key_from_meta(key: &str) -> Result<(), String> {
        let mut keys = Self::list_keys().unwrap_or_default();
        keys.retain(|k| k != key);
        Self::save_meta(&keys)?;
        Ok(())
    }

    fn save_meta(keys: &[String]) -> Result<(), String> {
        let entry =
            Entry::new(SERVICE, KEYS_META).map_err(|e| format!("keyring init error: {e}"))?;
        let data = keys.join("\n");
        entry
            .set_password(&data)
            .map_err(|e| format!("failed to save key metadata: {e}"))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_keys_are_not_empty() {
        assert!(!KNOWN_KEYS.is_empty());
    }

    #[test]
    fn known_keys_contains_expected() {
        assert!(KNOWN_KEYS.contains(&"anthropic_api_key"));
        assert!(KNOWN_KEYS.contains(&"openai_api_key"));
        assert!(KNOWN_KEYS.contains(&"github_token"));
        assert!(KNOWN_KEYS.contains(&"relay_token"));
    }
}
