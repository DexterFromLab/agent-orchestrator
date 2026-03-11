<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import * as pdfjsLib from 'pdfjs-dist';

  // Configure worker — use the bundled worker from pdfjs-dist
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/pdf.worker.min.mjs',
    import.meta.url,
  ).href;

  interface Props {
    filePath: string;
  }

  let { filePath }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let pageCount = $state(0);
  let currentScale = $state(1.0);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
  let renderTask: { cancel: () => void } | null = null;

  const SCALE_STEP = 0.25;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;

  async function loadPdf(path: string) {
    loading = true;
    error = null;

    // Clean up previous document
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }
    if (container) {
      container.querySelectorAll('.pdf-page-canvas').forEach(c => c.remove());
    }

    try {
      const assetUrl = convertFileSrc(path);
      const loadingTask = pdfjsLib.getDocument(assetUrl);
      pdfDoc = await loadingTask.promise;
      pageCount = pdfDoc.numPages;
      await renderAllPages();
    } catch (e) {
      error = `Failed to load PDF: ${e}`;
      console.warn('PDF load error:', e);
    } finally {
      loading = false;
    }
  }

  async function renderAllPages() {
    if (!pdfDoc || !container) return;

    // Clear existing canvases
    container.querySelectorAll('.pdf-page-canvas').forEach(c => c.remove());

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      await renderPage(i);
    }
  }

  async function renderPage(pageNum: number) {
    if (!pdfDoc || !container) return;

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: currentScale * window.devicePixelRatio });
    const displayViewport = page.getViewport({ scale: currentScale });

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${displayViewport.width}px`;
    canvas.style.height = `${displayViewport.height}px`;

    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderTask = page.render({ canvasContext: ctx, viewport });
    try {
      await renderTask.promise;
    } catch (e: unknown) {
      // Ignore cancelled renders
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name !== 'RenderingCancelledException') {
        console.warn(`Failed to render page ${pageNum}:`, e);
      }
    }
  }

  function zoomIn() {
    if (currentScale >= MAX_SCALE) return;
    currentScale = Math.min(MAX_SCALE, currentScale + SCALE_STEP);
    renderAllPages();
  }

  function zoomOut() {
    if (currentScale <= MIN_SCALE) return;
    currentScale = Math.max(MIN_SCALE, currentScale - SCALE_STEP);
    renderAllPages();
  }

  function resetZoom() {
    currentScale = 1.0;
    renderAllPages();
  }

  onMount(() => {
    loadPdf(filePath);
  });

  // React to filePath changes
  let lastPath = $state(filePath);
  $effect(() => {
    const p = filePath;
    if (p !== lastPath) {
      lastPath = p;
      loadPdf(p);
    }
  });

  onDestroy(() => {
    if (renderTask) {
      try { renderTask.cancel(); } catch { /* ignore */ }
    }
    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }
  });
</script>

<div class="pdf-viewer">
  <div class="pdf-toolbar">
    <span class="pdf-info">
      {#if loading}
        Loading…
      {:else if error}
        Error
      {:else}
        {pageCount} page{pageCount !== 1 ? 's' : ''}
      {/if}
    </span>
    <div class="pdf-zoom-controls">
      <button class="zoom-btn" onclick={zoomOut} disabled={currentScale <= MIN_SCALE} title="Zoom out">−</button>
      <button class="zoom-label" onclick={resetZoom} title="Reset zoom">{Math.round(currentScale * 100)}%</button>
      <button class="zoom-btn" onclick={zoomIn} disabled={currentScale >= MAX_SCALE} title="Zoom in">+</button>
    </div>
  </div>

  {#if error}
    <div class="pdf-error">{error}</div>
  {:else}
    <div class="pdf-pages" bind:this={container}></div>
  {/if}
</div>

<style>
  .pdf-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--ctp-crust);
  }

  .pdf-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.625rem;
    background: var(--ctp-mantle);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .pdf-info {
    font-size: 0.7rem;
    color: var(--ctp-overlay1);
  }

  .pdf-zoom-controls {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

  .zoom-btn, .zoom-label {
    background: transparent;
    border: 1px solid var(--ctp-surface1);
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.1875rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .zoom-btn:hover:not(:disabled), .zoom-label:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .zoom-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .zoom-label {
    min-width: 3rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .pdf-pages {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .pdf-pages :global(.pdf-page-canvas) {
    box-shadow: 0 1px 4px color-mix(in srgb, var(--ctp-crust) 60%, transparent);
    border-radius: 2px;
  }

  .pdf-error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ctp-red);
    font-size: 0.8rem;
    padding: 1rem;
  }
</style>
