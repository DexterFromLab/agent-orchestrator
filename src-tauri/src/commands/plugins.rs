// Plugin discovery and file access commands

use crate::AppState;
use crate::plugins;

#[tauri::command]
pub fn plugins_discover(state: tauri::State<'_, AppState>) -> Vec<plugins::PluginMeta> {
    let plugins_dir = state.app_config.plugins_dir();
    plugins::discover_plugins(&plugins_dir)
}

#[tauri::command]
pub fn plugin_read_file(
    state: tauri::State<'_, AppState>,
    plugin_id: String,
    filename: String,
) -> Result<String, String> {
    let plugins_dir = state.app_config.plugins_dir();
    plugins::read_plugin_file(&plugins_dir, &plugin_id, &filename)
}
