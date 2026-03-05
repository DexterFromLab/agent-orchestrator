<script lang="ts">
  import PaneContainer from './PaneContainer.svelte';

  // Phase 2: dynamic pane management, resize, presets
  // For now: single empty pane as placeholder
</script>

<div class="tiling-grid">
  <PaneContainer title="Welcome">
    <div class="welcome">
      <h1>BTerminal v2</h1>
      <p>Claude Agent Mission Control</p>
      <div class="status">
        <span class="badge">Phase 1 — Scaffold</span>
      </div>
    </div>
  </PaneContainer>
</div>

<style>
  .tiling-grid {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr;
    gap: var(--pane-gap);
    height: 100%;
    padding: var(--pane-gap);
  }

  .welcome {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--text-muted);
  }

  .welcome h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .welcome p {
    font-size: 14px;
  }

  .badge {
    background: var(--bg-surface);
    color: var(--accent);
    padding: 4px 12px;
    border-radius: var(--border-radius);
    font-size: 12px;
    margin-top: 8px;
  }
</style>
