<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import { getAllWorkItems, getActiveProjectId, setActiveProject } from '../../stores/workspace.svelte';
  import ProjectBox from './ProjectBox.svelte';

  let containerEl: HTMLDivElement | undefined = $state();
  let containerWidth = $state(0);

  let projects = $derived(getAllWorkItems());
  let activeProjectId = $derived(getActiveProjectId());
  let visibleCount = $derived(
    Math.min(projects.length, Math.max(1, Math.floor(containerWidth / 520))),
  );

  // Track slot elements for auto-scroll
  let slotEls = $state<Record<string, HTMLElement>>({});

  // Auto-scroll to active project only when activeProjectId changes
  // (untrack slotEls so agent re-renders don't trigger unwanted scrolls)
  $effect(() => {
    const id = activeProjectId;
    if (!id) return;
    untrack(() => {
      const el = slotEls[id];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  });

  let observer: ResizeObserver | undefined;

  onMount(() => {
    if (containerEl) {
      containerWidth = containerEl.clientWidth;
      observer = new ResizeObserver(entries => {
        for (const entry of entries) {
          containerWidth = entry.contentRect.width;
        }
      });
      observer.observe(containerEl);
    }
  });

  onDestroy(() => {
    observer?.disconnect();
  });
</script>

<div
  class="project-grid"
  bind:this={containerEl}
  style="--visible-count: {visibleCount}"
>
  {#each projects as project, i (project.id)}
    <div class="project-slot" bind:this={slotEls[project.id]}>
      <ProjectBox
        {project}
        slotIndex={i}
        active={activeProjectId === project.id}
        onactivate={() => setActiveProject(project.id)}
      />
    </div>
  {/each}

  {#if projects.length === 0}
    <div class="empty-state">
      No enabled projects in this group. Go to Settings to add projects.
    </div>
  {/if}
</div>

<style>
  .project-grid {
    display: flex;
    gap: 0.25rem;
    height: 100%;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding: 0.25rem;
  }

  .project-slot {
    flex: 0 0 calc((100% - (var(--visible-count) - 1) * 0.25rem) / var(--visible-count));
    min-width: 30rem;
    max-width: calc(100vh * var(--project-max-aspect, 1));
    display: flex;
  }

  .project-slot > :global(*) {
    flex: 1;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    color: var(--ctp-overlay0);
    font-size: 0.9rem;
  }
</style>
