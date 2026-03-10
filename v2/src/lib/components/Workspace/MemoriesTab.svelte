<script lang="ts">
  import { getDefaultAdapter, getAvailableAdapters, type MemoryAdapter, type MemoryNode } from '../../adapters/memory-adapter';

  let adapter = $state<MemoryAdapter | undefined>(undefined);
  let adapterName = $state('');
  let nodes = $state<MemoryNode[]>([]);
  let searchQuery = $state('');
  let loading = $state(false);
  let error = $state('');
  let total = $state(0);
  let selectedNode = $state<MemoryNode | null>(null);

  $effect(() => {
    adapter = getDefaultAdapter();
    adapterName = adapter?.name ?? '';
    if (adapter) {
      loadNodes();
    }
  });

  async function loadNodes() {
    if (!adapter) return;
    loading = true;
    error = '';
    try {
      const result = await adapter.list({ limit: 50 });
      nodes = result.nodes;
      total = result.total;
    } catch (e) {
      error = `Failed to load: ${e}`;
      nodes = [];
    } finally {
      loading = false;
    }
  }

  async function handleSearch() {
    if (!adapter || !searchQuery.trim()) {
      if (adapter) loadNodes();
      return;
    }
    loading = true;
    error = '';
    try {
      const result = await adapter.search(searchQuery.trim(), { limit: 50 });
      nodes = result.nodes;
      total = result.total;
    } catch (e) {
      error = `Search failed: ${e}`;
    } finally {
      loading = false;
    }
  }

  function selectNode(node: MemoryNode) {
    selectedNode = selectedNode?.id === node.id ? null : node;
  }

  function clearSearch() {
    searchQuery = '';
    selectedNode = null;
    loadNodes();
  }
</script>

<div class="memories-tab">
  {#if !adapter}
    <div class="no-adapter">
      <div class="no-adapter-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 8v4m0 4h.01"></path>
        </svg>
      </div>
      <p class="no-adapter-title">No memory adapter configured</p>
      <p class="no-adapter-hint">Register a memory adapter (e.g. Memora) to browse knowledge here.</p>
    </div>
  {:else}
    <div class="mem-header">
      <h3>{adapterName}</h3>
      <span class="mem-count">{total} memories</span>
      <div class="mem-adapters">
        {#each getAvailableAdapters() as a (a.name)}
          <button
            class="adapter-btn"
            class:active={a.name === adapterName}
            onclick={() => { adapter = a; adapterName = a.name; loadNodes(); }}
          >{a.name}</button>
        {/each}
      </div>
    </div>

    <div class="mem-search">
      <input
        type="text"
        class="search-input"
        placeholder="Search memories…"
        bind:value={searchQuery}
        onkeydown={(e) => { if (e.key === 'Enter') handleSearch(); }}
      />
      {#if searchQuery}
        <button class="clear-btn" onclick={clearSearch}>Clear</button>
      {/if}
    </div>

    {#if error}
      <div class="mem-error">{error}</div>
    {/if}

    <div class="mem-list">
      {#if loading}
        <div class="mem-state">Loading…</div>
      {:else if nodes.length === 0}
        <div class="mem-state">No memories found</div>
      {:else}
        {#each nodes as node (node.id)}
          <button class="mem-card" class:expanded={selectedNode?.id === node.id} onclick={() => selectNode(node)}>
            <div class="mem-card-header">
              <span class="mem-id">#{node.id}</span>
              <div class="mem-tags">
                {#each node.tags.slice(0, 4) as tag}
                  <span class="mem-tag">{tag}</span>
                {/each}
                {#if node.tags.length > 4}
                  <span class="mem-tag-more">+{node.tags.length - 4}</span>
                {/if}
              </div>
            </div>
            <div class="mem-card-content" class:truncated={selectedNode?.id !== node.id}>
              {node.content}
            </div>
            {#if selectedNode?.id === node.id && node.metadata}
              <div class="mem-card-meta">
                <pre>{JSON.stringify(node.metadata, null, 2)}</pre>
              </div>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .memories-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ctp-base);
    color: var(--ctp-text);
    overflow: hidden;
  }

  .no-adapter {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    padding: 2rem;
    text-align: center;
  }

  .no-adapter-icon {
    color: var(--ctp-overlay0);
  }

  .no-adapter-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ctp-subtext1);
    margin: 0;
  }

  .no-adapter-hint {
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    margin: 0;
  }

  .mem-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .mem-header h3 {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-blue);
    margin: 0;
    text-transform: capitalize;
  }

  .mem-count {
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
  }

  .mem-adapters {
    margin-left: auto;
    display: flex;
    gap: 0.25rem;
  }

  .adapter-btn {
    padding: 0.125rem 0.375rem;
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.25rem;
    background: transparent;
    color: var(--ctp-overlay1);
    font-size: 0.6rem;
    cursor: pointer;
    transition: all 0.12s;
  }

  .adapter-btn.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    border-color: var(--ctp-blue);
  }

  .mem-search {
    display: flex;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface0);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--ctp-blue);
  }

  .clear-btn {
    background: var(--ctp-surface0);
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.65rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .clear-btn:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }

  .mem-error {
    padding: 0.5rem 0.75rem;
    color: var(--ctp-red);
    font-size: 0.7rem;
    flex-shrink: 0;
  }

  .mem-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.375rem 0.5rem;
  }

  .mem-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
  }

  .mem-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    text-align: left;
    background: var(--ctp-surface0);
    border: 1px solid transparent;
    border-radius: 0.25rem;
    padding: 0.375rem 0.5rem;
    margin-bottom: 0.25rem;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }

  .mem-card:hover {
    background: var(--ctp-surface1);
  }

  .mem-card.expanded {
    border-color: var(--ctp-blue);
  }

  .mem-card-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.25rem;
  }

  .mem-id {
    font-size: 0.6rem;
    color: var(--ctp-overlay0);
    font-family: var(--term-font-family, monospace);
    flex-shrink: 0;
  }

  .mem-tags {
    display: flex;
    gap: 0.1875rem;
    flex-wrap: wrap;
    overflow: hidden;
  }

  .mem-tag {
    font-size: 0.55rem;
    padding: 0.0625rem 0.25rem;
    border-radius: 0.1875rem;
    background: color-mix(in srgb, var(--ctp-blue) 15%, transparent);
    color: var(--ctp-blue);
  }

  .mem-tag-more {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
  }

  .mem-card-content {
    font-size: 0.7rem;
    line-height: 1.4;
    color: var(--ctp-subtext0);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .mem-card-content.truncated {
    max-height: 3em;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .mem-card-meta {
    margin-top: 0.375rem;
    padding-top: 0.375rem;
    border-top: 1px solid var(--ctp-surface1);
  }

  .mem-card-meta pre {
    font-size: 0.6rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay1);
    white-space: pre-wrap;
    margin: 0;
    max-height: 10rem;
    overflow-y: auto;
  }
</style>
