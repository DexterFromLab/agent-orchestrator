// Desktop notification support via notify-rust

use notify_rust::{Notification, Urgency};

/// Send an OS desktop notification.
/// Fails gracefully if the notification daemon is unavailable.
pub fn send_desktop_notification(
    title: &str,
    body: &str,
    urgency: &str,
) -> Result<(), String> {
    let urgency_level = match urgency {
        "critical" => Urgency::Critical,
        "low" => Urgency::Low,
        _ => Urgency::Normal,
    };

    match Notification::new()
        .summary(title)
        .body(body)
        .appname("BTerminal")
        .urgency(urgency_level)
        .show()
    {
        Ok(_) => Ok(()),
        Err(e) => {
            tracing::warn!("Desktop notification failed (daemon unavailable?): {e}");
            Ok(()) // Graceful — don't propagate to frontend
        }
    }
}
