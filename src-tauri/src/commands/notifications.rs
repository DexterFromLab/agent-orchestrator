// Notification commands — desktop notification via notify-rust

use crate::notifications;

#[tauri::command]
pub fn notify_desktop(title: String, body: String, urgency: String) -> Result<(), String> {
    notifications::send_desktop_notification(&title, &body, &urgency)
}
