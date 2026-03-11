use crate::btmsg;

#[tauri::command]
pub fn btmsg_get_agents(group_id: String) -> Result<Vec<btmsg::BtmsgAgent>, String> {
    btmsg::get_agents(&group_id)
}

#[tauri::command]
pub fn btmsg_unread_count(agent_id: String) -> Result<i32, String> {
    btmsg::unread_count(&agent_id)
}

#[tauri::command]
pub fn btmsg_unread_messages(agent_id: String) -> Result<Vec<btmsg::BtmsgMessage>, String> {
    btmsg::unread_messages(&agent_id)
}

#[tauri::command]
pub fn btmsg_history(agent_id: String, other_id: String, limit: i32) -> Result<Vec<btmsg::BtmsgMessage>, String> {
    btmsg::history(&agent_id, &other_id, limit)
}

#[tauri::command]
pub fn btmsg_send(from_agent: String, to_agent: String, content: String) -> Result<String, String> {
    btmsg::send_message(&from_agent, &to_agent, &content)
}

#[tauri::command]
pub fn btmsg_set_status(agent_id: String, status: String) -> Result<(), String> {
    btmsg::set_status(&agent_id, &status)
}
