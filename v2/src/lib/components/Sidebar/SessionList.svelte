<script lang="ts">
  // Phase 4: session CRUD, groups, types
</script>

<div class="session-list">
  <div class="header">
    <h2>Sessions</h2>
  </div>
  <div class="empty-state">
    <p>No sessions yet.</p>
    <p class="hint">Phase 2 will add terminal sessions.</p>
  </div>
</div>

<style>
  .session-list {
    padding: 12px;
  }

  .header h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 12px;
  }

  .empty-state {
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
    padding: 24px 0;
  }

  .hint {
    margin-top: 4px;
    font-size: 11px;
    color: var(--ctp-overlay0);
  }
</style>
