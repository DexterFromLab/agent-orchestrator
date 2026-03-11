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

#[tauri::command]
pub fn btmsg_ensure_admin(group_id: String) -> Result<(), String> {
    btmsg::ensure_admin(&group_id)
}

#[tauri::command]
pub fn btmsg_all_feed(group_id: String, limit: i32) -> Result<Vec<btmsg::BtmsgFeedMessage>, String> {
    btmsg::all_feed(&group_id, limit)
}

#[tauri::command]
pub fn btmsg_mark_read(reader_id: String, sender_id: String) -> Result<(), String> {
    btmsg::mark_read_conversation(&reader_id, &sender_id)
}

#[tauri::command]
pub fn btmsg_get_channels(group_id: String) -> Result<Vec<btmsg::BtmsgChannel>, String> {
    btmsg::get_channels(&group_id)
}

#[tauri::command]
pub fn btmsg_channel_messages(channel_id: String, limit: i32) -> Result<Vec<btmsg::BtmsgChannelMessage>, String> {
    btmsg::get_channel_messages(&channel_id, limit)
}

#[tauri::command]
pub fn btmsg_channel_send(channel_id: String, from_agent: String, content: String) -> Result<String, String> {
    btmsg::send_channel_message(&channel_id, &from_agent, &content)
}

#[tauri::command]
pub fn btmsg_create_channel(name: String, group_id: String, created_by: String) -> Result<String, String> {
    btmsg::create_channel(&name, &group_id, &created_by)
}

#[tauri::command]
pub fn btmsg_add_channel_member(channel_id: String, agent_id: String) -> Result<(), String> {
    btmsg::add_channel_member(&channel_id, &agent_id)
}
