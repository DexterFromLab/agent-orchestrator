// Session state management — Svelte 5 runes
// Phase 4: full session CRUD, persistence

export type SessionType = 'terminal' | 'agent' | 'markdown';

export interface Session {
  id: string;
  type: SessionType;
  title: string;
  createdAt: number;
}

// Reactive session list
let sessions = $state<Session[]>([]);

export function getSessions() {
  return sessions;
}

export function addSession(session: Session) {
  sessions.push(session);
}

export function removeSession(id: string) {
  sessions = sessions.filter(s => s.id !== id);
}
