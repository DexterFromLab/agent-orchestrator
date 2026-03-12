// Search Bridge — Tauri IPC adapter for FTS5 full-text search

import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  resultType: string;
  id: string;
  title: string;
  snippet: string;
  score: number;
}

/** Confirm search database is ready (no-op, initialized at app startup). */
export async function initSearch(): Promise<void> {
  return invoke('search_init');
}

/** Search across all FTS5 tables (messages, tasks, btmsg). */
export async function searchAll(query: string, limit?: number): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_query', { query, limit: limit ?? 20 });
}

/** Drop and recreate all FTS5 tables (clears the index). */
export async function rebuildIndex(): Promise<void> {
  return invoke('search_rebuild');
}

/** Index an agent message into the search database. */
export async function indexMessage(sessionId: string, role: string, content: string): Promise<void> {
  return invoke('search_index_message', { sessionId, role, content });
}
