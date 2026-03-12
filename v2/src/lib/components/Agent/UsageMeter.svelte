<script lang="ts">
  interface Props {
    inputTokens: number;
    outputTokens: number;
    contextLimit?: number;
  }

  let { inputTokens, outputTokens, contextLimit = 200_000 }: Props = $props();

  let totalTokens = $derived(inputTokens + outputTokens);
  let pct = $derived(contextLimit > 0 ? Math.min((totalTokens / contextLimit) * 100, 100) : 0);

  let thresholdClass = $derived.by(() => {
    if (pct >= 90) return 'critical';
    if (pct >= 75) return 'high';
    if (pct >= 50) return 'medium';
    return 'low';
  });

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }

  let showTooltip = $state(false);
</script>

{#if totalTokens > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="usage-meter"
    class:critical={thresholdClass === 'critical'}
    class:high={thresholdClass === 'high'}
    class:medium={thresholdClass === 'medium'}
    class:low={thresholdClass === 'low'}
    onmouseenter={() => showTooltip = true}
    onmouseleave={() => showTooltip = false}
  >
    <div class="meter-track">
      <div class="meter-fill" style="width: {pct}%"></div>
    </div>
    <span class="meter-label">{formatTokens(totalTokens)}</span>

    {#if showTooltip}
      <div class="meter-tooltip">
        <div class="tooltip-row">
          <span class="tooltip-key">Input</span>
          <span class="tooltip-val">{formatTokens(inputTokens)}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-key">Output</span>
          <span class="tooltip-val">{formatTokens(outputTokens)}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-key">Total</span>
          <span class="tooltip-val">{formatTokens(totalTokens)}</span>
        </div>
        <div class="tooltip-divider"></div>
        <div class="tooltip-row">
          <span class="tooltip-key">Limit</span>
          <span class="tooltip-val">{formatTokens(contextLimit)}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-key">Used</span>
          <span class="tooltip-val">{pct.toFixed(1)}%</span>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .usage-meter {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    position: relative;
  }

  .meter-track {
    width: 3rem;
    height: 0.375rem;
    background: var(--ctp-surface0);
    border-radius: 0.1875rem;
    overflow: hidden;
    flex-shrink: 0;
  }

  .meter-fill {
    height: 100%;
    border-radius: 0.1875rem;
    transition: width 0.3s ease, background 0.3s ease;
  }

  .low .meter-fill { background: var(--ctp-green); }
  .medium .meter-fill { background: var(--ctp-yellow); }
  .high .meter-fill { background: var(--ctp-peach); }
  .critical .meter-fill { background: var(--ctp-red); }

  .meter-label {
    font-size: 0.625rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-overlay1);
    white-space: nowrap;
  }

  .meter-tooltip {
    position: absolute;
    bottom: calc(100% + 0.375rem);
    left: 50%;
    transform: translateX(-50%);
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    padding: 0.375rem 0.5rem;
    min-width: 7.5rem;
    z-index: 100;
    box-shadow: 0 0.125rem 0.5rem color-mix(in srgb, var(--ctp-crust) 40%, transparent);
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.0625rem 0;
  }

  .tooltip-key {
    font-size: 0.625rem;
    color: var(--ctp-overlay0);
  }

  .tooltip-val {
    font-size: 0.625rem;
    font-family: var(--term-font-family, monospace);
    color: var(--ctp-text);
  }

  .tooltip-divider {
    height: 1px;
    background: var(--ctp-surface1);
    margin: 0.1875rem 0;
  }
</style>
