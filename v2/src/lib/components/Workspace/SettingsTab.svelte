<script lang="ts">
  import { onMount } from 'svelte';
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
  import { getSetting, setSetting } from '../../adapters/settings-bridge';
  import { getCurrentTheme, setTheme } from '../../stores/theme.svelte';
  import { THEME_LIST, getPalette, type ThemeId } from '../../styles/themes';

  let activeGroupId = $derived(getActiveGroupId());
  let activeGroup = $derived(getActiveGroup());
  let activeProjectId = $derived(getActiveProjectId());
  let groups = $derived(getAllGroups());

  let editingProject = $derived(
    activeGroup?.projects.find(p => p.id === activeProjectId),
  );

  // Global settings
  let defaultShell = $state('');
  let defaultCwd = $state('');
  let fontFamily = $state('');
  let fontSize = $state('');
  let selectedTheme = $state<ThemeId>(getCurrentTheme());
  let themeDropdownOpen = $state(false);

  const FONT_OPTIONS = [
    'JetBrains Mono',
    'Fira Code',
    'Cascadia Code',
    'Source Code Pro',
    'IBM Plex Mono',
    'Hack',
    'Inconsolata',
    'Ubuntu Mono',
    'monospace',
  ];

  // Group themes by category
  const themeGroups = $derived(() => {
    const map = new Map<string, typeof THEME_LIST>();
    for (const t of THEME_LIST) {
      if (!map.has(t.group)) map.set(t.group, []);
      map.get(t.group)!.push(t);
    }
    return [...map.entries()];
  });

  let selectedThemeLabel = $derived(
    THEME_LIST.find(t => t.id === selectedTheme)?.label ?? selectedTheme,
  );

  onMount(async () => {
    const [shell, cwd, font, size] = await Promise.all([
      getSetting('default_shell'),
      getSetting('default_cwd'),
      getSetting('font_family'),
      getSetting('font_size'),
    ]);
    defaultShell = shell ?? '';
    defaultCwd = cwd ?? '';
    fontFamily = font ?? '';
    fontSize = size ?? '';
    selectedTheme = getCurrentTheme();

    // Apply saved font settings
    if (font) applyFont('--ui-font-family', `'${font}', monospace`);
    if (size) applyFont('--ui-font-size', `${size}px`);
  });

  function applyFont(prop: string, value: string) {
    document.documentElement.style.setProperty(prop, value);
  }

  async function saveGlobalSetting(key: string, value: string) {
    try {
      await setSetting(key, value);
    } catch (e) {
      console.error(`Failed to save setting ${key}:`, e);
    }
  }

  async function handleFontFamilyChange(family: string) {
    fontFamily = family;
    applyFont('--ui-font-family', family ? `'${family}', monospace` : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace");
    await saveGlobalSetting('font_family', family);
  }

  async function handleFontSizeChange(size: string) {
    const num = parseInt(size, 10);
    if (isNaN(num) || num < 8 || num > 24) return;
    fontSize = size;
    applyFont('--ui-font-size', `${num}px`);
    await saveGlobalSetting('font_size', size);
  }

  async function handleThemeChange(themeId: ThemeId) {
    selectedTheme = themeId;
    themeDropdownOpen = false;
    await setTheme(themeId);
  }

  function handleDropdownKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      themeDropdownOpen = false;
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.theme-dropdown')) {
      themeDropdownOpen = false;
    }
  }

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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="settings-tab" onclick={handleClickOutside}>
  <section class="settings-section">
    <h2>Global</h2>
    <div class="global-grid">
      <div class="setting-field">
        <span class="setting-label">Theme</span>
        <div class="theme-dropdown" onkeydown={handleDropdownKeydown}>
          <button
            class="theme-trigger"
            onclick={() => (themeDropdownOpen = !themeDropdownOpen)}
            aria-haspopup="listbox"
            aria-expanded={themeDropdownOpen}
          >
            <span
              class="theme-swatch"
              style="background: {getPalette(selectedTheme).base}; border-color: {getPalette(selectedTheme).surface1};"
            ></span>
            <span class="theme-trigger-label">{selectedThemeLabel}</span>
            <span class="theme-arrow">{themeDropdownOpen ? '\u25B4' : '\u25BE'}</span>
          </button>
          {#if themeDropdownOpen}
            <div class="theme-menu" role="listbox">
              {#each themeGroups() as [groupName, themes]}
                <div class="theme-group-label">{groupName}</div>
                {#each themes as t}
                  <button
                    class="theme-option"
                    class:active={t.id === selectedTheme}
                    role="option"
                    aria-selected={t.id === selectedTheme}
                    onclick={() => handleThemeChange(t.id)}
                  >
                    <span
                      class="theme-swatch"
                      style="background: {getPalette(t.id).base}; border-color: {getPalette(t.id).surface1};"
                    ></span>
                    <span class="theme-option-label">{t.label}</span>
                    <span class="theme-colors">
                      <span class="color-dot" style="background: {getPalette(t.id).red};"></span>
                      <span class="color-dot" style="background: {getPalette(t.id).green};"></span>
                      <span class="color-dot" style="background: {getPalette(t.id).blue};"></span>
                      <span class="color-dot" style="background: {getPalette(t.id).yellow};"></span>
                    </span>
                  </button>
                {/each}
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="setting-field">
        <label for="font-family" class="setting-label">Font family</label>
        <select
          id="font-family"
          class="setting-select"
          onchange={e => handleFontFamilyChange((e.target as HTMLSelectElement).value)}
        >
          <option value="" selected={!fontFamily}>Default (JetBrains Mono)</option>
          {#each FONT_OPTIONS as font}
            <option value={font} selected={fontFamily === font}>{font}</option>
          {/each}
        </select>
      </div>

      <div class="setting-field">
        <label for="font-size" class="setting-label">Font size</label>
        <div class="size-control">
          <button
            class="size-btn"
            onclick={() => handleFontSizeChange(String((parseInt(fontSize, 10) || 13) - 1))}
            disabled={parseInt(fontSize, 10) <= 8}
          >−</button>
          <input
            id="font-size"
            type="number"
            min="8"
            max="24"
            value={fontSize || '13'}
            class="size-input"
            onchange={e => handleFontSizeChange((e.target as HTMLInputElement).value)}
          />
          <span class="size-unit">px</span>
          <button
            class="size-btn"
            onclick={() => handleFontSizeChange(String((parseInt(fontSize, 10) || 13) + 1))}
            disabled={parseInt(fontSize, 10) >= 24}
          >+</button>
        </div>
      </div>

      <div class="setting-field">
        <label for="default-shell" class="setting-label">Default shell</label>
        <input
          id="default-shell"
          value={defaultShell}
          placeholder="/bin/bash"
          onchange={e => { defaultShell = (e.target as HTMLInputElement).value; saveGlobalSetting('default_shell', defaultShell); }}
        />
      </div>

      <div class="setting-field">
        <label for="default-cwd" class="setting-label">Default CWD</label>
        <input
          id="default-cwd"
          value={defaultCwd}
          placeholder="~"
          onchange={e => { defaultCwd = (e.target as HTMLInputElement).value; saveGlobalSetting('default_cwd', defaultCwd); }}
        />
      </div>
    </div>
  </section>

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
          <label class="project-field project-field-grow">
            <span class="field-label">Name</span>
            <input
              value={project.name}
              onchange={e => updateProject(activeGroupId, project.id, { name: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="project-field project-field-grow">
            <span class="field-label">CWD</span>
            <input
              value={project.cwd}
              onchange={e => updateProject(activeGroupId, project.id, { cwd: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label class="project-field">
            <span class="field-label">Icon</span>
            <input
              value={project.icon}
              onchange={e => updateProject(activeGroupId, project.id, { icon: (e.target as HTMLInputElement).value })}
              style="width: 60px"
            />
          </label>
          <label class="project-field">
            <span class="field-label">Enabled</span>
            <input
              type="checkbox"
              checked={project.enabled}
              onchange={e => updateProject(activeGroupId, project.id, { enabled: (e.target as HTMLInputElement).checked })}
            />
          </label>
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

  .global-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .setting-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-label {
    font-size: 0.7rem;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .setting-field input:not([type="number"]) {
    padding: 6px 10px;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .setting-select {
    padding: 6px 10px;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    cursor: pointer;
  }

  .size-control {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .size-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.9rem;
    cursor: pointer;
  }

  .size-btn:hover {
    background: var(--ctp-surface1);
  }

  .size-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .size-input {
    width: 48px;
    padding: 4px 6px;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    text-align: center;
    -moz-appearance: textfield;
  }

  .size-input::-webkit-inner-spin-button,
  .size-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }

  .size-unit {
    font-size: 0.75rem;
    color: var(--ctp-overlay0);
  }

  /* Custom theme dropdown */
  .theme-dropdown {
    position: relative;
  }

  .theme-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 8px;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
  }

  .theme-trigger:hover {
    border-color: var(--ctp-surface2);
  }

  .theme-trigger-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .theme-arrow {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    flex-shrink: 0;
  }

  .theme-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid;
    flex-shrink: 0;
  }

  .theme-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 280px;
    max-height: 400px;
    overflow-y: auto;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 100;
    padding: 4px 0;
  }

  .theme-group-label {
    padding: 6px 10px 2px;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 10px;
    background: transparent;
    border: none;
    color: var(--ctp-subtext1);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
  }

  .theme-option:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .theme-option.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .theme-option-label {
    flex: 1;
    white-space: nowrap;
  }

  .theme-colors {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .color-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  /* Groups & Projects */
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
    min-width: 0;
  }

  .project-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .project-field-grow {
    flex: 1;
  }

  .field-label {
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
  }

  .project-field input:not([type="checkbox"]) {
    padding: 4px 8px;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    min-width: 0;
    width: 100%;
  }

  .add-form {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    min-width: 0;
  }

  .add-form input {
    padding: 5px 10px;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 3px;
    color: var(--ctp-text);
    font-size: 0.8rem;
    flex: 1;
    min-width: 0;
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
    white-space: nowrap;
  }

  .limit-notice {
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    font-style: italic;
  }
</style>
