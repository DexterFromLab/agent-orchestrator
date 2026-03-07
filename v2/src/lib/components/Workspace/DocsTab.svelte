<script lang="ts">
  import { getActiveProjectId, getActiveGroup } from '../../stores/workspace.svelte';
  import { discoverMarkdownFiles, type MdFileEntry } from '../../adapters/groups-bridge';
  import MarkdownPane from '../Markdown/MarkdownPane.svelte';

  let files = $state<MdFileEntry[]>([]);
  let selectedPath = $state<string | null>(null);
  let loading = $state(false);

  let activeProjectId = $derived(getActiveProjectId());
  let activeGroup = $derived(getActiveGroup());
  let activeProject = $derived(
    activeGroup?.projects.find(p => p.id === activeProjectId),
  );

  $effect(() => {
    const project = activeProject;
    if (project) {
      loadFiles(project.cwd);
    } else {
      files = [];
      selectedPath = null;
    }
  });

  async function loadFiles(cwd: string) {
    loading = true;
    try {
      files = await discoverMarkdownFiles(cwd);
      // Auto-select first priority file
      const priority = files.find(f => f.priority);
      selectedPath = priority?.path ?? files[0]?.path ?? null;
    } catch (e) {
      console.warn('Failed to discover markdown files:', e);
      files = [];
    } finally {
      loading = false;
    }
  }
</script>

<div class="docs-tab">
  <aside class="file-picker">
    <h3 class="picker-title">
      {activeProject?.name ?? 'No project'} — Docs
    </h3>
    {#if loading}
      <div class="loading">Scanning...</div>
    {:else if files.length === 0}
      <div class="empty">No markdown files found</div>
    {:else}
      <ul class="file-list">
        {#each files as file}
          <li>
            <button
              class="file-btn"
              class:active={selectedPath === file.path}
              class:priority={file.priority}
              onclick={() => (selectedPath = file.path)}
            >
              {file.name}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>

  <main class="doc-content">
    {#if selectedPath}
      <MarkdownPane paneId="docs-viewer" filePath={selectedPath} />
    {:else}
      <div class="no-selection">Select a document from the sidebar</div>
    {/if}
  </main>
</div>

<style>
  .docs-tab {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .file-picker {
    width: 220px;
    flex-shrink: 0;
    background: var(--ctp-mantle);
    border-right: 1px solid var(--ctp-surface0);
    overflow-y: auto;
    padding: 8px 0;
  }

  .picker-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ctp-subtext0);
    padding: 4px 12px 8px;
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .file-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .file-btn {
    display: block;
    width: 100%;
    padding: 5px 12px;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.8rem;
    text-align: left;
    cursor: pointer;
    transition: color 0.1s, background 0.1s;
  }

  .file-btn:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .file-btn.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .file-btn.priority {
    color: var(--ctp-blue);
  }

  .file-btn.priority.active {
    color: var(--ctp-blue);
  }

  .doc-content {
    flex: 1;
    overflow: auto;
  }

  .loading, .empty, .no-selection {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ctp-overlay0);
    font-size: 0.85rem;
    padding: 20px;
  }

  .no-selection {
    height: 100%;
  }
</style>
