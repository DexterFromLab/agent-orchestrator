<script lang="ts">
  import {
    getActiveProjectId,
    getActiveGroup,
    getActiveGroupId,
    getAllGroups,
    updateProject,
    addProject,
    removeProject,
    addGroup,
    removeGroup,
    switchGroup,
  } from '../../stores/workspace.svelte';
  import { deriveIdentifier } from '../../types/groups';

  let activeGroupId = $derived(getActiveGroupId());
  let activeGroup = $derived(getActiveGroup());
  let activeProjectId = $derived(getActiveProjectId());
  let groups = $derived(getAllGroups());

  let editingProject = $derived(
    activeGroup?.projects.find(p => p.id === activeProjectId),
  );

  // New project form
  let newName = $state('');
  let newCwd = $state('');

  function handleAddProject() {
    if (!newName.trim() || !newCwd.trim() || !activeGroupId) return;
    const id = crypto.randomUUID();
    addProject(activeGroupId, {
      id,
      name: newName.trim(),
      identifier: deriveIdentifier(newName.trim()),
      description: '',
      icon: '\uf120',
      cwd: newCwd.trim(),
      profile: 'default',
      enabled: true,
    });
    newName = '';
    newCwd = '';
  }

  // New group form
  let newGroupName = $state('');

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    const id = crypto.randomUUID();
    addGroup({ id, name: newGroupName.trim(), projects: [] });
    newGroupName = '';
  }
</script>

<div class="settings-tab">
  <section class="settings-section">
    <h2>Groups</h2>
    <div class="group-list">
      {#each groups as group}
        <div class="group-row" class:active={group.id === activeGroupId}>
          <button class="group-name" onclick={() => switchGroup(group.id)}>
            {group.name}
          </button>
          <span class="group-count">{group.projects.length} projects</span>
          {#if groups.length > 1}
            <button class="btn-danger" onclick={() => removeGroup(group.id)}>Remove</button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="add-form">
      <input bind:value={newGroupName} placeholder="New group name" />
      <button class="btn-primary" onclick={handleAddGroup} disabled={!newGroupName.trim()}>
        Add Group
      </button>
    </div>
  </section>

  {#if activeGroup}
    <section class="settings-section">
      <h2>Projects in "{activeGroup.name}"</h2>

      {#each activeGroup.projects as project}
        <div class="project-settings-row">
          <div class="project-field">
            <label>Name</label>
            <input
              value={project.name}
              onchange={e => updateProject(activeGroupId, project.id, { name: (e.target as HTMLInputElement).value })}
            />
          </div>
          <div class="project-field">
            <label>CWD</label>
            <input
              value={project.cwd}
              onchange={e => updateProject(activeGroupId, project.id, { cwd: (e.target as HTMLInputElement).value })}
            />
          </div>
          <div class="project-field">
            <label>Icon</label>
            <input
              value={project.icon}
              onchange={e => updateProject(activeGroupId, project.id, { icon: (e.target as HTMLInputElement).value })}
              style="width: 60px"
            />
          </div>
          <div class="project-field">
            <label>Enabled</label>
            <input
              type="checkbox"
              checked={project.enabled}
              onchange={e => updateProject(activeGroupId, project.id, { enabled: (e.target as HTMLInputElement).checked })}
            />
          </div>
          <button class="btn-danger" onclick={() => removeProject(activeGroupId, project.id)}>
            Remove
          </button>
        </div>
      {/each}

      {#if activeGroup.projects.length < 5}
        <div class="add-form">
          <input bind:value={newName} placeholder="Project name" />
          <input bind:value={newCwd} placeholder="/path/to/project" />
          <button class="btn-primary" onclick={handleAddProject} disabled={!newName.trim() || !newCwd.trim()}>
            Add Project
          </button>
        </div>
      {:else}
        <p class="limit-notice">Maximum 5 projects per group reached.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .settings-tab {
    padding: 16px 24px;
    overflow-y: auto;
    height: 100%;
    max-width: 900px;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--ctp-text);
    margin: 0 0 12px;
  }

  .settings-section {
    margin-bottom: 24px;
  }

  .group-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--ctp-surface0);
    border-radius: 4px;
  }

  .group-row.active {
    border-left: 3px solid var(--ctp-blue);
  }

  .group-name {
    background: transparent;
    border: none;
    color: var(--ctp-text);
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
    flex: 1;
    text-align: left;
  }

  .group-count {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
  }

  .project-settings-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 10px;
    background: var(--ctp-surface0);
    border-radius: 4px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }

  .project-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .project-field label {
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
  }

  .project-field input[type="text"],
  .project-field input:not([type]) {
    padding: 4px 8px;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .add-form {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
  }

  .add-form input {
    padding: 5px 10px;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    flex: 1;
  }

  .btn-primary {
    padding: 5px 14px;
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 3px;
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger {
    padding: 4px 10px;
    background: transparent;
    color: var(--ctp-red);
    border: 1px solid var(--ctp-red);
    border-radius: 3px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .limit-notice {
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    font-style: italic;
  }
</style>
