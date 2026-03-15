/**
 * Memora IPC bridge — read-only access to the Memora memory database.
 * Wraps Tauri commands and provides a MemoryAdapter implementation.
 */

import { invoke } from '@tauri-apps/api/core';
import type { MemoryAdapter, MemoryNode, MemorySearchResult } from './memory-adapter';

// --- Raw IPC types (match Rust structs) ---

interface MemoraNode {
  id: number;
  content: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface MemoraSearchResult {
  nodes: MemoraNode[];
  total: number;
}

// --- IPC wrappers ---

export async function memoraAvailable(): Promise<boolean> {
  return invoke<boolean>('memora_available');
}

export async function memoraList(options?: {
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<MemoraSearchResult> {
  return invoke<MemoraSearchResult>('memora_list', {
    tags: options?.tags ?? null,
    limit: options?.limit ?? 50,
    offset: options?.offset ?? 0,
  });
}

export async function memoraSearch(
  query: string,
  options?: { tags?: string[]; limit?: number },
): Promise<MemoraSearchResult> {
  return invoke<MemoraSearchResult>('memora_search', {
    query,
    tags: options?.tags ?? null,
    limit: options?.limit ?? 50,
  });
}

export async function memoraGet(id: number): Promise<MemoraNode | null> {
  return invoke<MemoraNode | null>('memora_get', { id });
}

// --- MemoryAdapter implementation ---

function toMemoryNode(n: MemoraNode): MemoryNode {
  return {
    id: n.id,
    content: n.content,
    tags: n.tags,
    metadata: n.metadata,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
}

function toSearchResult(r: MemoraSearchResult): MemorySearchResult {
  return {
    nodes: r.nodes.map(toMemoryNode),
    total: r.total,
  };
}

export class MemoraAdapter implements MemoryAdapter {
  readonly name = 'memora';
  private _available: boolean | null = null;

  get available(): boolean {
    // Optimistic: assume available until first check proves otherwise.
    // Actual availability is checked lazily on first operation.
    return this._available ?? true;
  }

  async checkAvailability(): Promise<boolean> {
    this._available = await memoraAvailable();
    return this._available;
  }

  async list(options?: {
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<MemorySearchResult> {
    const result = await memoraList(options);
    this._available = true;
    return toSearchResult(result);
  }

  async search(
    query: string,
    options?: { tags?: string[]; limit?: number },
  ): Promise<MemorySearchResult> {
    const result = await memoraSearch(query, options);
    this._available = true;
    return toSearchResult(result);
  }

  async get(id: string | number): Promise<MemoryNode | null> {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return null;
    const node = await memoraGet(numId);
    if (node) {
      this._available = true;
      return toMemoryNode(node);
    }
    return null;
  }
}
