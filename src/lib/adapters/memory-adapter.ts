/**
 * Pluggable memory adapter interface.
 * Memora is the default implementation, but others can be swapped in.
 */

export interface MemoryNode {
  id: string | number;
  content: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface MemorySearchResult {
  nodes: MemoryNode[];
  total: number;
}

export interface MemoryAdapter {
  readonly name: string;
  readonly available: boolean;

  /** List memories, optionally filtered by tags */
  list(options?: { tags?: string[]; limit?: number; offset?: number }): Promise<MemorySearchResult>;

  /** Semantic search across memories */
  search(query: string, options?: { tags?: string[]; limit?: number }): Promise<MemorySearchResult>;

  /** Get a single memory by ID */
  get(id: string | number): Promise<MemoryNode | null>;
}

/** Registry of available memory adapters */
const adapters = new Map<string, MemoryAdapter>();

export function registerMemoryAdapter(adapter: MemoryAdapter): void {
  adapters.set(adapter.name, adapter);
}

export function getMemoryAdapter(name: string): MemoryAdapter | undefined {
  return adapters.get(name);
}

export function getAvailableAdapters(): MemoryAdapter[] {
  return Array.from(adapters.values()).filter(a => a.available);
}

export function getDefaultAdapter(): MemoryAdapter | undefined {
  // Prefer Memora if available, otherwise first available
  return adapters.get('memora') ?? getAvailableAdapters()[0];
}
