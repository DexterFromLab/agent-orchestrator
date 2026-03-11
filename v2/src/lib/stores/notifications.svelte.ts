// Notification store — ephemeral toast messages

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
}

let notifications = $state<Notification[]>([]);

const MAX_TOASTS = 5;
const TOAST_DURATION_MS = 4000;

export function getNotifications(): Notification[] {
  return notifications;
}

export function notify(type: NotificationType, message: string): string {
  const id = crypto.randomUUID();
  notifications.push({ id, type, message, timestamp: Date.now() });

  // Cap visible toasts
  if (notifications.length > MAX_TOASTS) {
    notifications = notifications.slice(-MAX_TOASTS);
  }

  // Auto-dismiss
  setTimeout(() => dismissNotification(id), TOAST_DURATION_MS);

  return id;
}

export function dismissNotification(id: string): void {
  notifications = notifications.filter(n => n.id !== id);
}
