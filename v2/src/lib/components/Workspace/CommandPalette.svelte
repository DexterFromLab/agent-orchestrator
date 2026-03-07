<script lang="ts">
  import { getAllGroups, switchGroup, getActiveGroupId } from '../../stores/workspace.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
  }

  let { open, onclose }: Props = $props();

  let query = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  let groups = $derived(getAllGroups());
  let filtered = $derived(
    groups.filter(g =>
      g.name.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  let activeGroupId = $derived(getActiveGroupId());

  $effect(() => {
    if (open) {
      query = '';
      // Focus input after render
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  function selectGroup(groupId: string) {
    switchGroup(groupId);
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="palette-backdrop" onclick={onclose} onkeydown={handleKeydown}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="palette" onclick={(e) => e.stopPropagation()} onkeydown={handleKeydown}>
      <input
        bind:this={inputEl}
        bind:value={query}
        class="palette-input"
        placeholder="Switch group..."
        onkeydown={handleKeydown}
      />
      <ul class="palette-results">
        {#each filtered as group}
          <li>
            <button
              class="palette-item"
              class:active={group.id === activeGroupId}
              onclick={() => selectGroup(group.id)}
            >
              <span class="group-name">{group.name}</span>
              <span class="project-count">{group.projects.length} projects</span>
            </button>
          </li>
        {/each}
        {#if filtered.length === 0}
          <li class="no-results">No groups match "{query}"</li>
        {/if}
      </ul>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .palette {
    width: 460px;
    max-height: 360px;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    align-self: flex-start;
  }

  .palette-input {
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--ctp-surface0);
    color: var(--ctp-text);
    font-size: 0.95rem;
    outline: none;
  }

  .palette-input::placeholder {
    color: var(--ctp-overlay0);
  }

  .palette-results {
    list-style: none;
    margin: 0;
    padding: 4px;
    overflow-y: auto;
  }

  .palette-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font-size: 0.85rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.1s;
  }

  .palette-item:hover {
    background: var(--ctp-surface0);
  }

  .palette-item.active {
    background: var(--ctp-surface0);
    border-left: 3px solid var(--ctp-blue);
  }

  .group-name {
    font-weight: 600;
  }

  .project-count {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
  }

  .no-results {
    padding: 12px;
    color: var(--ctp-overlay0);
    font-size: 0.85rem;
    text-align: center;
  }
</style>
