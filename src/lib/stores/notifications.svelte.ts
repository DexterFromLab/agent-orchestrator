// Notification store — ephemeral toasts + persistent notification history

import { sendDesktopNotification } from '../adapters/notifications-bridge';

// --- Toast types (existing) ---

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  timestamp: number;
}

// --- Notification history types (new) ---

export type NotificationType =
  | 'agent_complete'
  | 'agent_error'
  | 'task_review'
  | 'wake_event'
  | 'conflict'
  | 'system';

export interface HistoryNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  timestamp: number;
  read: boolean;
  projectId?: string;
}

// --- State ---

let toasts = $state<Toast[]>([]);
let notificationHistory = $state<HistoryNotification[]>([]);

const MAX_TOASTS = 5;
const TOAST_DURATION_MS = 4000;
const MAX_HISTORY = 100;

// --- Toast API (preserved from original) ---

export function getNotifications(): Toast[] {
  return toasts;
}

export function notify(type: ToastType, message: string): string {
  const id = crypto.randomUUID();
  toasts.push({ id, type, message, timestamp: Date.now() });

  // Cap visible toasts
  if (toasts.length > MAX_TOASTS) {
    toasts = toasts.slice(-MAX_TOASTS);
  }

  // Auto-dismiss
  setTimeout(() => dismissNotification(id), TOAST_DURATION_MS);

  return id;
}

export function dismissNotification(id: string): void {
  toasts = toasts.filter(n => n.id !== id);
}

// --- Notification History API (new) ---

/** Map NotificationType to a toast type for the ephemeral toast */
function notificationTypeToToast(type: NotificationType): ToastType {
  switch (type) {
    case 'agent_complete': return 'success';
    case 'agent_error': return 'error';
    case 'task_review': return 'info';
    case 'wake_event': return 'info';
    case 'conflict': return 'warning';
    case 'system': return 'info';
  }
}

/** Map NotificationType to OS notification urgency */
function notificationUrgency(type: NotificationType): 'low' | 'normal' | 'critical' {
  switch (type) {
    case 'agent_error': return 'critical';
    case 'conflict': return 'normal';
    case 'system': return 'normal';
    default: return 'low';
  }
}

/**
 * Add a notification to history, show a toast, and send an OS desktop notification.
 */
export function addNotification(
  title: string,
  body: string,
  type: NotificationType,
  projectId?: string,
): string {
  const id = crypto.randomUUID();

  // Add to history
  notificationHistory.push({
    id,
    title,
    body,
    type,
    timestamp: Date.now(),
    read: false,
    projectId,
  });

  // Cap history
  if (notificationHistory.length > MAX_HISTORY) {
    notificationHistory = notificationHistory.slice(-MAX_HISTORY);
  }

  // Show ephemeral toast
  const toastType = notificationTypeToToast(type);
  notify(toastType, `${title}: ${body}`);

  // Send OS desktop notification (fire-and-forget)
  sendDesktopNotification(title, body, notificationUrgency(type));

  return id;
}

export function getNotificationHistory(): HistoryNotification[] {
  return notificationHistory;
}

export function getUnreadCount(): number {
  return notificationHistory.filter(n => !n.read).length;
}

export function markRead(id: string): void {
  const entry = notificationHistory.find(n => n.id === id);
  if (entry) entry.read = true;
}

export function markAllRead(): void {
  for (const entry of notificationHistory) {
    entry.read = true;
  }
}

export function clearHistory(): void {
  notificationHistory = [];
}
