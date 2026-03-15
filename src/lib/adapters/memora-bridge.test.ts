import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import {
  memoraAvailable,
  memoraList,
  memoraSearch,
  memoraGet,
  MemoraAdapter,
} from './memora-bridge';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('memora IPC wrappers', () => {
  it('memoraAvailable invokes memora_available', async () => {
    mockInvoke.mockResolvedValue(true);
    const result = await memoraAvailable();
    expect(result).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('memora_available');
  });

  it('memoraList invokes memora_list with defaults', async () => {
    mockInvoke.mockResolvedValue({ nodes: [], total: 0 });
    await memoraList();
    expect(mockInvoke).toHaveBeenCalledWith('memora_list', {
      tags: null,
      limit: 50,
      offset: 0,
    });
  });

  it('memoraList passes tags and pagination', async () => {
    mockInvoke.mockResolvedValue({ nodes: [], total: 0 });
    await memoraList({ tags: ['bterminal'], limit: 10, offset: 5 });
    expect(mockInvoke).toHaveBeenCalledWith('memora_list', {
      tags: ['bterminal'],
      limit: 10,
      offset: 5,
    });
  });

  it('memoraSearch invokes memora_search', async () => {
    mockInvoke.mockResolvedValue({ nodes: [], total: 0 });
    await memoraSearch('test query', { tags: ['foo'], limit: 20 });
    expect(mockInvoke).toHaveBeenCalledWith('memora_search', {
      query: 'test query',
      tags: ['foo'],
      limit: 20,
    });
  });

  it('memoraSearch uses defaults when no options', async () => {
    mockInvoke.mockResolvedValue({ nodes: [], total: 0 });
    await memoraSearch('hello');
    expect(mockInvoke).toHaveBeenCalledWith('memora_search', {
      query: 'hello',
      tags: null,
      limit: 50,
    });
  });

  it('memoraGet invokes memora_get', async () => {
    const node = { id: 42, content: 'test', tags: ['a'], metadata: null, created_at: null, updated_at: null };
    mockInvoke.mockResolvedValue(node);
    const result = await memoraGet(42);
    expect(result).toEqual(node);
    expect(mockInvoke).toHaveBeenCalledWith('memora_get', { id: 42 });
  });

  it('memoraGet returns null for missing', async () => {
    mockInvoke.mockResolvedValue(null);
    const result = await memoraGet(999);
    expect(result).toBeNull();
  });
});

describe('MemoraAdapter', () => {
  it('has name "memora"', () => {
    const adapter = new MemoraAdapter();
    expect(adapter.name).toBe('memora');
  });

  it('available is true by default (optimistic)', () => {
    const adapter = new MemoraAdapter();
    expect(adapter.available).toBe(true);
  });

  it('checkAvailability updates available state', async () => {
    mockInvoke.mockResolvedValue(false);
    const adapter = new MemoraAdapter();
    const result = await adapter.checkAvailability();
    expect(result).toBe(false);
    expect(adapter.available).toBe(false);
  });

  it('list returns mapped MemorySearchResult', async () => {
    mockInvoke.mockResolvedValue({
      nodes: [
        { id: 1, content: 'hello', tags: ['a', 'b'], metadata: { key: 'val' }, created_at: '2026-01-01', updated_at: null },
      ],
      total: 1,
    });

    const adapter = new MemoraAdapter();
    const result = await adapter.list({ limit: 10 });
    expect(result.total).toBe(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe(1);
    expect(result.nodes[0].content).toBe('hello');
    expect(result.nodes[0].tags).toEqual(['a', 'b']);
    expect(result.nodes[0].metadata).toEqual({ key: 'val' });
  });

  it('search returns mapped results', async () => {
    mockInvoke.mockResolvedValue({
      nodes: [{ id: 5, content: 'found', tags: ['x'], metadata: null, created_at: null, updated_at: null }],
      total: 1,
    });

    const adapter = new MemoraAdapter();
    const result = await adapter.search('found', { limit: 5 });
    expect(result.nodes[0].content).toBe('found');
    expect(adapter.available).toBe(true);
  });

  it('get returns mapped node', async () => {
    mockInvoke.mockResolvedValue({
      id: 10, content: 'node', tags: ['t'], metadata: null, created_at: '2026-01-01', updated_at: '2026-01-02',
    });

    const adapter = new MemoraAdapter();
    const node = await adapter.get(10);
    expect(node).not.toBeNull();
    expect(node!.id).toBe(10);
    expect(node!.updated_at).toBe('2026-01-02');
  });

  it('get returns null for missing node', async () => {
    mockInvoke.mockResolvedValue(null);
    const adapter = new MemoraAdapter();
    const node = await adapter.get(999);
    expect(node).toBeNull();
  });

  it('get handles string id', async () => {
    mockInvoke.mockResolvedValue({
      id: 7, content: 'x', tags: [], metadata: null, created_at: null, updated_at: null,
    });

    const adapter = new MemoraAdapter();
    const node = await adapter.get('7');
    expect(node).not.toBeNull();
    expect(mockInvoke).toHaveBeenCalledWith('memora_get', { id: 7 });
  });

  it('get returns null for non-numeric string id', async () => {
    const adapter = new MemoraAdapter();
    const node = await adapter.get('abc');
    expect(node).toBeNull();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
