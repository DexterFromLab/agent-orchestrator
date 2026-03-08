<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { marked, Renderer } from 'marked';
  import { watchFile, unwatchFile, onFileChanged, type FileChangedPayload } from '../../adapters/file-bridge';
  import { getHighlighter, highlightCode, escapeHtml } from '../../utils/highlight';

  interface Props {
    filePath: string;
    paneId: string;
    onExit?: () => void;
  }

  let { filePath, paneId, onExit }: Props = $props();

  let renderedHtml = $state('');
  let error = $state('');
  let unlisten: (() => void) | undefined;
  let currentWatchPath = $state<string | null>(null);
  let highlighterReady = $state(false);

  const renderer = new Renderer();
  renderer.code = function({ text, lang }: { text: string; lang?: string }) {
    if (lang) {
      const highlighted = highlightCode(text, lang);
      if (highlighted !== escapeHtml(text)) return highlighted;
    }
    return `<pre><code>${escapeHtml(text)}</code></pre>`;
  };

  function renderMarkdown(source: string): void {
    try {
      renderedHtml = marked.parse(source, { renderer, async: false }) as string;
      error = '';
    } catch (e) {
      error = `Render error: ${e}`;
    }
  }

  // React to filePath changes — re-watch the new file
  $effect(() => {
    if (!highlighterReady) return;
    const path = filePath;
    if (path === currentWatchPath) return;

    // Unwatch previous file
    if (currentWatchPath) {
      unwatchFile(paneId).catch(() => {});
    }

    currentWatchPath = path;
    watchFile(paneId, path)
      .then(content => renderMarkdown(content))
      .catch(e => { error = `Failed to open file: ${e}`; });
  });

  onMount(async () => {
    try {
      await getHighlighter();
      highlighterReady = true;

      unlisten = await onFileChanged((payload: FileChangedPayload) => {
        if (payload.pane_id === paneId) {
          renderMarkdown(payload.content);
        }
      });
    } catch (e) {
      error = `Failed to initialize: ${e}`;
    }
  });

  onDestroy(() => {
    unlisten?.();
    unwatchFile(paneId).catch(() => {});
  });
</script>

<div class="markdown-pane">
  {#if error}
    <div class="error">{error}</div>
  {:else}
    <div class="markdown-body">
      {@html renderedHtml}
    </div>
  {/if}
  <div class="file-path">{filePath}</div>
</div>

<style>
  .markdown-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--ctp-base);
    color: var(--ctp-text);
  }

  .markdown-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.75rem 2rem;
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 0.9rem;
    line-height: 1.7;
    color: var(--ctp-subtext1);
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-feature-settings: 'cv01', 'cv02', 'cv03', 'cv04', 'ss01';
  }

  /* --- Headings --- */

  .markdown-body :global(h1) {
    font-size: 1.75em;
    font-weight: 700;
    line-height: 1.2;
    margin: 1.5em 0 0.6em;
    color: var(--ctp-lavender);
    padding-bottom: 0.35em;
    border-bottom: 1px solid color-mix(in srgb, var(--ctp-surface1) 60%, transparent);
    letter-spacing: -0.01em;
  }

  .markdown-body :global(h1:first-child) {
    margin-top: 0;
  }

  .markdown-body :global(h2) {
    font-size: 1.4em;
    font-weight: 650;
    line-height: 1.25;
    margin: 1.75em 0 0.5em;
    color: var(--ctp-blue);
    letter-spacing: -0.005em;
  }

  .markdown-body :global(h3) {
    font-size: 1.15em;
    font-weight: 600;
    line-height: 1.3;
    margin: 1.5em 0 0.4em;
    color: var(--ctp-sapphire);
  }

  .markdown-body :global(h4) {
    font-size: 1em;
    font-weight: 600;
    line-height: 1.4;
    margin: 1.25em 0 0.35em;
    color: var(--ctp-teal);
    text-transform: none;
  }

  .markdown-body :global(h5) {
    font-size: 0.875em;
    font-weight: 600;
    line-height: 1.4;
    margin: 1.25em 0 0.3em;
    color: var(--ctp-subtext1);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .markdown-body :global(h6) {
    font-size: 0.8em;
    font-weight: 600;
    line-height: 1.4;
    margin: 1em 0 0.25em;
    color: var(--ctp-overlay2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* --- Prose --- */

  .markdown-body :global(p) {
    margin: 1.15em 0;
  }

  .markdown-body :global(strong) {
    color: var(--ctp-text);
    font-weight: 600;
  }

  .markdown-body :global(em) {
    color: var(--ctp-subtext0);
    font-style: italic;
  }

  /* --- Links --- */

  .markdown-body :global(a) {
    color: var(--ctp-blue);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ctp-blue) 30%, transparent);
    text-underline-offset: 0.2em;
    text-decoration-thickness: 1px;
    transition: text-decoration-color 0.2s ease;
  }

  .markdown-body :global(a:hover) {
    text-decoration-color: var(--ctp-blue);
  }

  /* --- Inline code --- */

  .markdown-body :global(code) {
    background: color-mix(in srgb, var(--ctp-surface0) 70%, transparent);
    padding: 0.175em 0.4em;
    border-radius: 0.25em;
    font-family: var(--term-font-family, 'JetBrains Mono', monospace);
    font-size: 0.85em;
    color: var(--ctp-green);
    font-variant-ligatures: none;
  }

  /* --- Code blocks --- */

  .markdown-body :global(pre) {
    background: var(--ctp-mantle);
    padding: 1rem 1.125rem;
    border-radius: 0.375rem;
    border: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.6;
    margin: 1.25em 0;
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ctp-surface1) 20%, transparent);
  }

  .markdown-body :global(pre code) {
    background: none;
    padding: 0;
    color: var(--ctp-text);
    font-size: inherit;
    border-radius: 0;
  }

  .markdown-body :global(.shiki) {
    background: var(--ctp-mantle) !important;
    padding: 1rem 1.125rem;
    border-radius: 0.375rem;
    border: 1px solid var(--ctp-surface0);
    overflow-x: auto;
    font-size: 0.8rem;
    line-height: 1.6;
    margin: 1.25em 0;
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--ctp-surface1) 20%, transparent);
  }

  .markdown-body :global(.shiki code) {
    background: none !important;
    padding: 0;
  }

  /* --- Blockquote --- */

  .markdown-body :global(blockquote) {
    position: relative;
    border-left: 3px solid var(--ctp-mauve);
    margin: 1.5em 0;
    padding: 0.5rem 1.125rem;
    color: var(--ctp-overlay2);
    background: color-mix(in srgb, var(--ctp-surface0) 20%, transparent);
    border-radius: 0 0.25rem 0.25rem 0;
    font-style: italic;
  }

  .markdown-body :global(blockquote p) {
    margin: 0.5em 0;
  }

  .markdown-body :global(blockquote p:first-child) {
    margin-top: 0;
  }

  .markdown-body :global(blockquote p:last-child) {
    margin-bottom: 0;
  }

  /* --- Lists --- */

  .markdown-body :global(ul), .markdown-body :global(ol) {
    padding-left: 1.625em;
    margin: 1em 0;
  }

  .markdown-body :global(li) {
    margin: 0.35em 0;
  }

  .markdown-body :global(li::marker) {
    color: var(--ctp-overlay1);
  }

  .markdown-body :global(ol > li::marker) {
    color: var(--ctp-overlay2);
    font-variant-numeric: tabular-nums;
  }

  .markdown-body :global(li > ul), .markdown-body :global(li > ol) {
    margin: 0.25em 0;
  }

  /* --- Tables --- */

  .markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1.5em 0;
    font-size: 0.85em;
    line-height: 1.5;
  }

  .markdown-body :global(th), .markdown-body :global(td) {
    border: 1px solid var(--ctp-surface1);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  .markdown-body :global(th) {
    background: color-mix(in srgb, var(--ctp-surface0) 60%, transparent);
    font-weight: 600;
    color: var(--ctp-subtext1);
    font-size: 0.9em;
    text-transform: none;
  }

  .markdown-body :global(tr:hover td) {
    background: color-mix(in srgb, var(--ctp-surface0) 30%, transparent);
  }

  /* --- Horizontal rule --- */

  .markdown-body :global(hr) {
    border: none;
    height: 1px;
    margin: 2em 0;
    background: linear-gradient(
      to right,
      transparent,
      var(--ctp-surface1) 15%,
      var(--ctp-surface1) 85%,
      transparent
    );
  }

  /* --- Images --- */

  .markdown-body :global(img) {
    max-width: 100%;
    border-radius: 0.375rem;
    margin: 1.25em 0;
  }

  /* --- Status bar --- */

  .file-path {
    border-top: 1px solid var(--ctp-surface0);
    padding: 0.25rem 0.75rem;
    font-size: 0.65rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay0);
    flex-shrink: 0;
  }

  .error {
    color: var(--ctp-red);
    padding: 1.5rem 2rem;
    font-size: 0.85rem;
    font-family: 'Inter', system-ui, sans-serif;
  }
</style>
