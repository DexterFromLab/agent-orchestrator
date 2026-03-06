<script lang="ts">
  import { onMount } from 'svelte';
  import {
    ctxListProjects,
    ctxGetContext,
    ctxGetShared,
    ctxGetSummaries,
    ctxSearch,
    type CtxProject,
    type CtxEntry,
    type CtxSummary,
  } from '../../adapters/ctx-bridge';

  interface Props {
    onExit?: () => void;
  }

  let { onExit }: Props = $props();

  let projects = $state<CtxProject[]>([]);
  let selectedProject = $state<string | null>(null);
  let entries = $state<CtxEntry[]>([]);
  let sharedEntries = $state<CtxEntry[]>([]);
  let summaries = $state<CtxSummary[]>([]);
  let searchQuery = $state('');
  let searchResults = $state<CtxEntry[]>([]);
  let error = $state('');
  let loading = $state(false);

  onMount(async () => {
    try {
      projects = await ctxListProjects();
      sharedEntries = await ctxGetShared();
    } catch (e) {
      error = `ctx database not available: ${e}`;
    }
  });

  async function selectProject(name: string) {
    selectedProject = name;
    loading = true;
    try {
      [entries, summaries] = await Promise.all([
        ctxGetContext(name),
        ctxGetSummaries(name, 5),
      ]);
      error = '';
    } catch (e) {
      error = `Failed to load context: ${e}`;
    } finally {
      loading = false;
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    try {
      searchResults = await ctxSearch(searchQuery);
    } catch (e) {
      error = `Search failed: ${e}`;
    }
  }
</script>

<div class="context-pane">
  <div class="ctx-header">
    <h3>Context Manager</h3>
    <input
      type="text"
      class="search-input"
      placeholder="Search contexts..."
      bind:value={searchQuery}
      onkeydown={(e) => { if (e.key === 'Enter') handleSearch(); }}
    />
  </div>

  {#if error}
    <div class="ctx-error">{error}</div>
  {/if}

  <div class="ctx-body">
    {#if searchResults.length > 0}
      <div class="section">
        <h4>Search Results</h4>
        {#each searchResults as result}
          <div class="entry">
            <div class="entry-header">
              <span class="entry-project">{result.project}</span>
              <span class="entry-key">{result.key}</span>
            </div>
            <pre class="entry-value">{result.value}</pre>
          </div>
        {/each}
        <button class="clear-btn" onclick={() => { searchResults = []; searchQuery = ''; }}>Clear search</button>
      </div>
    {:else}
      <div class="project-list">
        <h4>Projects</h4>
        {#if projects.length === 0}
          <p class="empty">No projects registered. Use <code>ctx init</code> to add one.</p>
        {/if}
        {#each projects as project}
          <button
            class="project-btn"
            class:active={selectedProject === project.name}
            onclick={() => selectProject(project.name)}
          >
            <span class="project-name">{project.name}</span>
            <span class="project-desc">{project.description}</span>
          </button>
        {/each}
      </div>

      {#if sharedEntries.length > 0}
        <div class="section">
          <h4>Shared Context</h4>
          {#each sharedEntries as entry}
            <div class="entry">
              <div class="entry-header">
                <span class="entry-key">{entry.key}</span>
              </div>
              <pre class="entry-value">{entry.value}</pre>
            </div>
          {/each}
        </div>
      {/if}

      {#if selectedProject && !loading}
        <div class="section">
          <h4>{selectedProject} Context</h4>
          {#if entries.length === 0}
            <p class="empty">No context entries for this project.</p>
          {/if}
          {#each entries as entry}
            <div class="entry">
              <div class="entry-header">
                <span class="entry-key">{entry.key}</span>
                <span class="entry-date">{entry.updated_at}</span>
              </div>
              <pre class="entry-value">{entry.value}</pre>
            </div>
          {/each}
        </div>

        {#if summaries.length > 0}
          <div class="section">
            <h4>Recent Sessions</h4>
            {#each summaries as summary}
              <div class="entry">
                <div class="entry-header">
                  <span class="entry-date">{summary.created_at}</span>
                </div>
                <pre class="entry-value">{summary.summary}</pre>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      {#if loading}
        <div class="loading">Loading...</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .context-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 13px;
  }

  .ctx-header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }

  .ctx-header h3 {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .search-input {
    flex: 1;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 4px 8px;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .ctx-error {
    color: var(--ctp-red);
    padding: 8px 12px;
    font-size: 12px;
  }

  .ctx-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
  }

  .project-list {
    margin-bottom: 12px;
  }

  h4 {
    font-size: 11px;
    font-weight: 600;
    color: var(--ctp-mauve);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .project-btn {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    padding: 6px 8px;
    margin-bottom: 4px;
    cursor: pointer;
    text-align: left;
    color: var(--text-primary);
  }

  .project-btn:hover { border-color: var(--accent); }
  .project-btn.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, var(--bg-surface));
  }

  .project-name {
    font-weight: 600;
    font-size: 12px;
  }

  .project-desc {
    font-size: 10px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .section {
    margin-bottom: 16px;
  }

  .entry {
    background: var(--bg-surface);
    border-radius: var(--border-radius);
    padding: 6px 8px;
    margin-bottom: 4px;
  }

  .entry-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .entry-project {
    font-size: 10px;
    color: var(--ctp-blue);
    font-weight: 600;
  }

  .entry-key {
    font-size: 11px;
    font-weight: 600;
    color: var(--ctp-green);
  }

  .entry-date {
    font-size: 9px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .entry-value {
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-secondary);
    max-height: 200px;
    overflow-y: auto;
    margin: 0;
  }

  .empty {
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
  }

  .clear-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    border-radius: var(--border-radius);
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
    margin-top: 4px;
  }

  .clear-btn:hover { color: var(--text-primary); }

  .loading {
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
    padding: 16px;
  }
</style>
