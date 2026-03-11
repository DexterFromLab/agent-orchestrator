use crate::groups::{GroupsFile, MdFileEntry};

#[tauri::command]
pub fn groups_load() -> Result<GroupsFile, String> {
    crate::groups::load_groups()
}

#[tauri::command]
pub fn groups_save(config: GroupsFile) -> Result<(), String> {
    crate::groups::save_groups(&config)
}

#[tauri::command]
pub fn discover_markdown_files(cwd: String) -> Result<Vec<MdFileEntry>, String> {
    crate::groups::discover_markdown_files(&cwd)
}
