use crate::bttask;

#[tauri::command]
pub fn bttask_list(group_id: String) -> Result<Vec<bttask::Task>, String> {
    bttask::list_tasks(&group_id)
}

#[tauri::command]
pub fn bttask_comments(task_id: String) -> Result<Vec<bttask::TaskComment>, String> {
    bttask::task_comments(&task_id)
}

#[tauri::command]
pub fn bttask_update_status(task_id: String, status: String) -> Result<(), String> {
    bttask::update_task_status(&task_id, &status)
}

#[tauri::command]
pub fn bttask_add_comment(task_id: String, agent_id: String, content: String) -> Result<String, String> {
    bttask::add_comment(&task_id, &agent_id, &content)
}

#[tauri::command]
pub fn bttask_create(
    title: String,
    description: String,
    priority: String,
    group_id: String,
    created_by: String,
    assigned_to: Option<String>,
) -> Result<String, String> {
    bttask::create_task(&title, &description, &priority, &group_id, &created_by, assigned_to.as_deref())
}

#[tauri::command]
pub fn bttask_delete(task_id: String) -> Result<(), String> {
    bttask::delete_task(&task_id)
}

#[tauri::command]
pub fn bttask_review_queue_count(group_id: String) -> Result<i64, String> {
    bttask::review_queue_count(&group_id)
}
