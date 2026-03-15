use crate::secrets::SecretsManager;

#[tauri::command]
pub fn secrets_store(key: String, value: String) -> Result<(), String> {
    SecretsManager::store_secret(&key, &value)
}

#[tauri::command]
pub fn secrets_get(key: String) -> Result<Option<String>, String> {
    SecretsManager::get_secret(&key)
}

#[tauri::command]
pub fn secrets_delete(key: String) -> Result<(), String> {
    SecretsManager::delete_secret(&key)
}

#[tauri::command]
pub fn secrets_list() -> Result<Vec<String>, String> {
    SecretsManager::list_keys()
}

#[tauri::command]
pub fn secrets_has_keyring() -> bool {
    SecretsManager::has_keyring()
}

#[tauri::command]
pub fn secrets_known_keys() -> Vec<String> {
    crate::secrets::KNOWN_KEYS
        .iter()
        .map(|s| s.to_string())
        .collect()
}
