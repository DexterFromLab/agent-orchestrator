<script lang="ts">
  import { listDirectoryChildren, readFileContent, type DirEntry, type FileContent } from '../../adapters/files-bridge';
  import { getHighlighter, highlightCode, escapeHtml } from '../../utils/highlight';
  import { convertFileSrc } from '@tauri-apps/api/core';

  interface Props {
    cwd: string;
  }

  let { cwd }: Props = $props();

  // Tree state: expanded dirs and their children
  interface TreeNode extends DirEntry {
    children?: TreeNode[];
    loading?: boolean;
    depth: number;
  }

  // Open file tab
  interface FileTab {
    path: string;
    name: string;
    pinned: boolean;
    content: FileContent | null;
  }

  let roots = $state<TreeNode[]>([]);
  let expandedPaths = $state<Set<string>>(new Set());
  let highlighterReady = $state(false);

  // Tab state: open file tabs + active tab
  let fileTabs = $state<FileTab[]>([]);
  let activeTabPath = $state<string | null>(null);
  let fileLoading = $state(false);

  // Sidebar state
  let sidebarCollapsed = $state(false);
  let sidebarWidth = $state(14); // rem
  let resizing = $state(false);

  // Derived: active tab's content
  let activeTab = $derived(fileTabs.find(t => t.path === activeTabPath) ?? null);

  // Load root directory
  $effect(() => {
    const dir = cwd;
    loadDirectory(dir).then(entries => {
      roots = entries.map(e => ({ ...e, depth: 0 }));
    });
    getHighlighter().then(() => { highlighterReady = true; });
  });

  async function loadDirectory(path: string): Promise<DirEntry[]> {
    try {
      return await listDirectoryChildren(path);
    } catch (e) {
      console.warn('Failed to list directory:', e);
      return [];
    }
  }

  async function toggleDir(node: TreeNode) {
    const path = node.path;
    if (expandedPaths.has(path)) {
      const next = new Set(expandedPaths);
      next.delete(path);
      expandedPaths = next;
    } else {
      if (!node.children) {
        node.loading = true;
        const entries = await loadDirectory(path);
        node.children = entries.map(e => ({ ...e, depth: node.depth + 1 }));
        node.loading = false;
      }
      expandedPaths = new Set([...expandedPaths, path]);
    }
  }

  /** Single click: preview file (replaces existing preview tab) */
  async function previewFile(node: TreeNode) {
    if (node.is_dir) {
      toggleDir(node);
      return;
    }
    // If already open as pinned tab, just focus it
    const existing = fileTabs.find(t => t.path === node.path);
    if (existing?.pinned) {
      activeTabPath = node.path;
      return;
    }

    // Replace any existing preview (unpinned) tab
    const previewIdx = fileTabs.findIndex(t => !t.pinned);
    const tab: FileTab = {
      path: node.path,
      name: node.name,
      pinned: false,
      content: null,
    };

    if (existing) {
      // Already the preview tab, just refocus
      activeTabPath = node.path;
      return;
    }

    if (previewIdx >= 0) {
      fileTabs[previewIdx] = tab;
    } else {
      fileTabs = [...fileTabs, tab];
    }
    activeTabPath = node.path;

    // Load content
    fileLoading = true;
    try {
      tab.content = await readFileContent(node.path);
    } catch (e) {
      tab.content = { type: 'Binary', message: `Error: ${e}` };
    } finally {
      fileLoading = false;
    }
  }

  /** Double click: pin the file as a permanent tab */
  function pinFile(node: TreeNode) {
    if (node.is_dir) return;
    const existing = fileTabs.find(t => t.path === node.path);
    if (existing) {
      existing.pinned = true;
      activeTabPath = node.path;
    } else {
      // Open and pin directly
      previewFile(node).then(() => {
        const tab = fileTabs.find(t => t.path === node.path);
        if (tab) tab.pinned = true;
      });
    }
  }

  function closeTab(path: string) {
    fileTabs = fileTabs.filter(t => t.path !== path);
    if (activeTabPath === path) {
      activeTabPath = fileTabs[fileTabs.length - 1]?.path ?? null;
    }
  }

  function flattenTree(nodes: TreeNode[]): TreeNode[] {
    const result: TreeNode[] = [];
    for (const node of nodes) {
      result.push(node);
      if (node.is_dir && expandedPaths.has(node.path) && node.children) {
        result.push(...flattenTree(node.children));
      }
    }
    return result;
  }

  let flatNodes = $derived(flattenTree(roots));

  function fileIcon(node: TreeNode): string {
    if (node.is_dir) return expandedPaths.has(node.path) ? '📂' : '📁';
    const ext = node.ext;
    if (['ts', 'tsx'].includes(ext)) return '🟦';
    if (['js', 'jsx', 'mjs'].includes(ext)) return '🟨';
    if (ext === 'rs') return '🦀';
    if (ext === 'py') return '🐍';
    if (ext === 'svelte') return '🟧';
    if (['md', 'markdown'].includes(ext)) return '📝';
    if (['json', 'toml', 'yaml', 'yml'].includes(ext)) return '⚙️';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return '🖼️';
    if (ext === 'pdf') return '📄';
    if (['css', 'scss', 'less'].includes(ext)) return '🎨';
    if (['html', 'htm'].includes(ext)) return '🌐';
    return '📄';
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderHighlighted(content: string, lang: string): string {
    if (!highlighterReady || lang === 'text' || lang === 'csv') {
      return `<pre><code>${escapeHtml(content)}</code></pre>`;
    }
    const highlighted = highlightCode(content, lang);
    if (highlighted !== escapeHtml(content)) return highlighted;
    return `<pre><code>${escapeHtml(content)}</code></pre>`;
  }

  function isImageExt(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'].includes(ext);
  }

  // Drag-resize sidebar
  function startResize(e: MouseEvent) {
    e.preventDefault();
    resizing = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const newWidth = startWidth + delta / 16; // convert px to rem (approx)
      sidebarWidth = Math.max(8, Math.min(30, newWidth));
    }

    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
</script>

<div class="files-tab">
  {#if !sidebarCollapsed}
    <aside class="tree-sidebar" style="width: {sidebarWidth}rem">
      <div class="tree-header">
        <span class="tree-title">Explorer</span>
        <button class="collapse-btn" onclick={() => sidebarCollapsed = true} title="Collapse sidebar">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="tree-list">
        {#each flatNodes as node (node.path)}
          <button
            class="tree-row"
            class:selected={activeTabPath === node.path}
            class:dir={node.is_dir}
            style="padding-left: {0.5 + node.depth * 1}rem"
            onclick={() => previewFile(node)}
            ondblclick={() => pinFile(node)}
          >
            <span class="tree-icon">{fileIcon(node)}</span>
            <span class="tree-name">{node.name}</span>
            {#if !node.is_dir}
              <span class="tree-size">{formatSize(node.size)}</span>
            {/if}
            {#if node.loading}
              <span class="tree-loading">…</span>
            {/if}
          </button>
        {/each}
        {#if flatNodes.length === 0}
          <div class="tree-empty">No files</div>
        {/if}
      </div>
    </aside>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="resize-handle" class:active={resizing} onmousedown={startResize}></div>
  {:else}
    <button class="expand-btn" onclick={() => sidebarCollapsed = false} title="Show explorer">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  {/if}

  <main class="file-viewer">
    <!-- File tabs bar -->
    {#if fileTabs.length > 0}
      <div class="file-tab-bar">
        {#each fileTabs as tab (tab.path)}
          <button
            class="file-tab"
            class:active={activeTabPath === tab.path}
            class:preview={!tab.pinned}
            onclick={() => activeTabPath = tab.path}
            ondblclick={() => { tab.pinned = true; }}
          >
            <span class="file-tab-name" class:italic={!tab.pinned}>{tab.name}</span>
            <button class="file-tab-close" onclick={(e) => { e.stopPropagation(); closeTab(tab.path); }}>×</button>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Content area -->
    {#if fileLoading && activeTabPath && !activeTab?.content}
      <div class="viewer-state">Loading…</div>
    {:else if !activeTab}
      <div class="viewer-state">Select a file to view</div>
    {:else if activeTab.content?.type === 'TooLarge'}
      <div class="viewer-state">
        <span class="viewer-warning">File too large</span>
        <span class="viewer-detail">{formatSize(activeTab.content.size)}</span>
      </div>
    {:else if activeTab.content?.type === 'Binary'}
      {#if isImageExt(activeTab.path)}
        <div class="viewer-image">
          <img src={convertFileSrc(activeTab.path)} alt={activeTab.name} />
        </div>
      {:else}
        <div class="viewer-state">{activeTab.content.message}</div>
      {/if}
    {:else if activeTab.content?.type === 'Text'}
      <div class="viewer-code">
        {#if activeTab.content.lang === 'csv'}
          <pre class="csv-content"><code>{activeTab.content.content}</code></pre>
        {:else}
          {@html renderHighlighted(activeTab.content.content, activeTab.content.lang)}
        {/if}
      </div>
    {/if}

    {#if activeTab}
      <div class="viewer-path">{activeTab.path}</div>
    {/if}
  </main>
</div>

<style>
  .files-tab {
    display: flex;
    height: 100%;
    overflow: hidden;
    flex: 1;
  }

  /* --- Sidebar --- */

  .tree-sidebar {
    flex-shrink: 0;
    background: var(--ctp-mantle);
    border-right: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 8rem;
    max-width: 30rem;
  }

  .tree-header {
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tree-title {
    font-size: 0.675rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ctp-overlay1);
  }

  .collapse-btn, .expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--ctp-overlay1);
    cursor: pointer;
    padding: 0.125rem;
    border-radius: 0.1875rem;
    transition: color 0.12s, background 0.12s;
  }

  .collapse-btn:hover, .expand-btn:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface0);
  }

  .expand-btn {
    flex-shrink: 0;
    width: 1.5rem;
    height: 100%;
    background: var(--ctp-mantle);
    border-right: 1px solid var(--ctp-surface0);
    border-radius: 0;
    padding: 0;
  }

  .resize-handle {
    width: 4px;
    cursor: col-resize;
    background: transparent;
    flex-shrink: 0;
    transition: background 0.15s;
    margin-left: -2px;
    margin-right: -2px;
    z-index: 1;
  }

  .resize-handle:hover, .resize-handle.active {
    background: var(--ctp-blue);
  }

  .tree-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    height: 1.5rem;
    border: none;
    background: transparent;
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: background 0.1s;
    padding-right: 0.375rem;
  }

  .tree-row:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .tree-row.selected {
    background: color-mix(in srgb, var(--accent, var(--ctp-blue)) 15%, transparent);
    color: var(--ctp-text);
  }

  .tree-row.dir {
    font-weight: 500;
  }

  .tree-icon {
    font-size: 0.65rem;
    flex-shrink: 0;
    width: 1rem;
    text-align: center;
  }

  .tree-name {
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .tree-size {
    font-size: 0.575rem;
    color: var(--ctp-overlay0);
    flex-shrink: 0;
    margin-left: auto;
  }

  .tree-loading {
    color: var(--ctp-overlay0);
    font-size: 0.6rem;
  }

  .tree-empty {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    padding: 1rem;
    text-align: center;
  }

  /* --- File tab bar --- */

  .file-tab-bar {
    display: flex;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .file-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.375rem 0.25rem 0.625rem;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ctp-overlay1);
    font-size: 0.675rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.1s, background 0.1s;
    max-width: 10rem;
  }

  .file-tab:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-subtext1);
  }

  .file-tab.active {
    background: var(--ctp-base);
    color: var(--ctp-text);
    border-bottom-color: var(--accent, var(--ctp-blue));
  }

  .file-tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .file-tab-name.italic {
    font-style: italic;
  }

  .file-tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    border: none;
    background: transparent;
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
    cursor: pointer;
    border-radius: 0.125rem;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
  }

  .file-tab:hover .file-tab-close,
  .file-tab.active .file-tab-close {
    opacity: 1;
  }

  .file-tab-close:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }

  /* --- Viewer --- */

  .file-viewer {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--ctp-base);
  }

  .viewer-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
  }

  .viewer-warning {
    color: var(--ctp-yellow);
    font-weight: 600;
  }

  .viewer-detail {
    font-size: 0.7rem;
  }

  .viewer-code {
    flex: 1;
    overflow: auto;
    padding: 0.75rem 1rem;
  }

  .viewer-code :global(pre) {
    margin: 0;
    font-family: var(--term-font-family, 'JetBrains Mono', monospace);
    font-size: 0.775rem;
    line-height: 1.55;
    color: var(--ctp-text);
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .viewer-code :global(code) {
    font-family: inherit;
    background: none;
    padding: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .viewer-code :global(.shiki) {
    background: transparent !important;
    padding: 0;
    margin: 0;
    border: none;
    box-shadow: none;
    white-space: pre-wrap !important;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .viewer-code :global(.shiki code) {
    white-space: pre-wrap !important;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .csv-content {
    font-family: var(--term-font-family, monospace);
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-wrap: break-word;
    tab-size: 4;
  }

  .viewer-image {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    overflow: auto;
  }

  .viewer-image img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 0.25rem;
  }

  .viewer-path {
    border-top: 1px solid var(--ctp-surface0);
    padding: 0.25rem 0.75rem;
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay0);
    flex-shrink: 0;
  }
</style>
