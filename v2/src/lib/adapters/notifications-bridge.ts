// Notifications bridge — wraps Tauri desktop notification command

import { invoke } from '@tauri-apps/api/core';

export type NotificationUrgency = 'low' | 'normal' | 'critical';

/**
 * Send an OS desktop notification via notify-rust.
 * Fire-and-forget: errors are swallowed (notification daemon may not be running).
 */
export function sendDesktopNotification(
  title: string,
  body: string,
  urgency: NotificationUrgency = 'normal',
): void {
  invoke('notify_desktop', { title, body, urgency }).catch(() => {
    // Swallow IPC errors — notifications must never break the app
  });
}
