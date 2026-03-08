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
  import { listProfiles, type ClaudeProfile } from '../../adapters/claude-bridge';
  import { invoke } from '@tauri-apps/api/core';

  const PROJECT_ICONS = [
    '📁', '🚀', '🤖', '🌐', '🔧', '🎮', '📱', '💻',
    '🔬', '📊', '🎨', '🔒', '💬', '📦', '⚡', '🧪',
    '🏗️', '📝', '🎯', '💡', '🔥', '🛠️', '🧩', '🗄️',
  ];

  // Claude profiles for account selector
  let profiles = $state<ClaudeProfile[]>([]);

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
  let uiFont = $state('');
  let uiFontSize = $state('');
  let termFont = $state('');
  let termFontSize = $state('');
  let selectedTheme = $state<ThemeId>(getCurrentTheme());

  // Dropdown open states
  let themeDropdownOpen = $state(false);
  let uiFontDropdownOpen = $state(false);
  let termFontDropdownOpen = $state(false);

  // Per-project icon picker & profile dropdown (keyed by project id)
  let iconPickerOpenFor = $state<string | null>(null);
  let profileDropdownOpenFor = $state<string | null>(null);

  const UI_FONTS = [
    { value: '', label: 'System Default' },
    { value: 'Inter', label: 'Inter' },
    { value: 'IBM Plex Sans', label: 'IBM Plex Sans' },
    { value: 'Noto Sans', label: 'Noto Sans' },
    { value: 'Roboto', label: 'Roboto' },
    { value: 'Source Sans 3', label: 'Source Sans 3' },
    { value: 'Ubuntu', label: 'Ubuntu' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
  ];

  const TERM_FONTS = [
    { value: '', label: 'Default (JetBrains Mono)' },
    { value: 'JetBrains Mono', label: 'JetBrains Mono' },
    { value: 'Fira Code', label: 'Fira Code' },
    { value: 'Cascadia Code', label: 'Cascadia Code' },
    { value: 'Source Code Pro', label: 'Source Code Pro' },
    { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
    { value: 'Hack', label: 'Hack' },
    { value: 'Inconsolata', label: 'Inconsolata' },
    { value: 'Ubuntu Mono', label: 'Ubuntu Mono' },
    { value: 'monospace', label: 'monospace' },
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

  let uiFontLabel = $derived(
    UI_FONTS.find(f => f.value === uiFont)?.label ?? 'System Default',
  );

  let termFontLabel = $derived(
    TERM_FONTS.find(f => f.value === termFont)?.label ?? 'Default (JetBrains Mono)',
  );

  onMount(async () => {
    const [shell, cwd, font, size, tfont, tsize] = await Promise.all([
      getSetting('default_shell'),
      getSetting('default_cwd'),
      getSetting('ui_font_family'),
      getSetting('ui_font_size'),
      getSetting('term_font_family'),
      getSetting('term_font_size'),
    ]);
    defaultShell = shell ?? '';
    defaultCwd = cwd ?? '';
    uiFont = font ?? '';
    uiFontSize = size ?? '';
    termFont = tfont ?? '';
    termFontSize = tsize ?? '';
    selectedTheme = getCurrentTheme();

    try {
      profiles = await listProfiles();
    } catch {
      profiles = [];
    }
  });

  function applyCssProp(prop: string, value: string) {
    document.documentElement.style.setProperty(prop, value);
  }

  async function saveGlobalSetting(key: string, value: string) {
    try {
      await setSetting(key, value);
    } catch (e) {
      console.error(`Failed to save setting ${key}:`, e);
    }
  }

  async function handleUiFontChange(family: string) {
    uiFont = family;
    uiFontDropdownOpen = false;
    const val = family
      ? `'${family}', sans-serif`
      : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";
    applyCssProp('--ui-font-family', val);
    await saveGlobalSetting('ui_font_family', family);
  }

  async function handleUiFontSizeChange(size: string) {
    const num = parseInt(size, 10);
    if (isNaN(num) || num < 8 || num > 24) return;
    uiFontSize = size;
    applyCssProp('--ui-font-size', `${num}px`);
    await saveGlobalSetting('ui_font_size', size);
  }

  async function handleTermFontChange(family: string) {
    termFont = family;
    termFontDropdownOpen = false;
    const val = family
      ? `'${family}', monospace`
      : "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace";
    applyCssProp('--term-font-family', val);
    await saveGlobalSetting('term_font_family', family);
  }

  async function handleTermFontSizeChange(size: string) {
    const num = parseInt(size, 10);
    if (isNaN(num) || num < 8 || num > 24) return;
    termFontSize = size;
    applyCssProp('--term-font-size', `${num}px`);
    await saveGlobalSetting('term_font_size', size);
  }

  async function handleThemeChange(themeId: ThemeId) {
    selectedTheme = themeId;
    themeDropdownOpen = false;
    await setTheme(themeId);
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.custom-dropdown')) {
      themeDropdownOpen = false;
      uiFontDropdownOpen = false;
      termFontDropdownOpen = false;
    }
    if (!target.closest('.icon-field')) {
      iconPickerOpenFor = null;
    }
    if (!target.closest('.profile-field')) {
      profileDropdownOpenFor = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      themeDropdownOpen = false;
      uiFontDropdownOpen = false;
      termFontDropdownOpen = false;
      iconPickerOpenFor = null;
      profileDropdownOpenFor = null;
    }
  }

  function getProfileLabel(profileName: string): string {
    const p = profiles.find(pr => pr.name === profileName);
    return p?.display_name || p?.name || profileName || 'default';
  }

  async function browseDirectory(): Promise<string | null> {
    const selected = await invoke<string | null>('pick_directory');
    return selected ?? null;
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
      icon: '📁',
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
<div class="settings-tab" onclick={handleClickOutside} onkeydown={handleKeydown}>
  <section class="settings-section">
    <h2>Appearance</h2>
    <div class="settings-list">
      <div class="setting-field">
        <span class="setting-label">Theme</span>
        <div class="custom-dropdown">
          <button
            class="dropdown-trigger"
            onclick={() => { themeDropdownOpen = !themeDropdownOpen; uiFontDropdownOpen = false; termFontDropdownOpen = false; }}
            aria-haspopup="listbox"
            aria-expanded={themeDropdownOpen}
          >
            <span
              class="theme-swatch"
              style="background: {getPalette(selectedTheme).base}; border-color: {getPalette(selectedTheme).surface1};"
            ></span>
            <span class="dropdown-label">{selectedThemeLabel}</span>
            <span class="dropdown-arrow">{themeDropdownOpen ? '\u25B4' : '\u25BE'}</span>
          </button>
          {#if themeDropdownOpen}
            <div class="dropdown-menu" role="listbox">
              {#each themeGroups() as [groupName, themes]}
                <div class="dropdown-group-label">{groupName}</div>
                {#each themes as t}
                  <button
                    class="dropdown-option"
                    class:active={t.id === selectedTheme}
                    role="option"
                    aria-selected={t.id === selectedTheme}
                    onclick={() => handleThemeChange(t.id)}
                  >
                    <span
                      class="theme-swatch"
                      style="background: {getPalette(t.id).base}; border-color: {getPalette(t.id).surface1};"
                    ></span>
                    <span class="dropdown-option-label">{t.label}</span>
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
        <span class="setting-label">UI Font</span>
        <div class="setting-row">
          <div class="custom-dropdown dropdown-grow">
            <button
              class="dropdown-trigger"
              onclick={() => { uiFontDropdownOpen = !uiFontDropdownOpen; themeDropdownOpen = false; termFontDropdownOpen = false; }}
              aria-haspopup="listbox"
              aria-expanded={uiFontDropdownOpen}
            >
              <span class="dropdown-label" style={uiFont ? `font-family: '${uiFont}', sans-serif` : ''}>{uiFontLabel}</span>
              <span class="dropdown-arrow">{uiFontDropdownOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {#if uiFontDropdownOpen}
              <div class="dropdown-menu" role="listbox">
                {#each UI_FONTS as f}
                  <button
                    class="dropdown-option"
                    class:active={f.value === uiFont}
                    role="option"
                    aria-selected={f.value === uiFont}
                    style={f.value ? `font-family: '${f.value}', sans-serif` : ''}
                    onclick={() => handleUiFontChange(f.value)}
                  >
                    <span class="dropdown-option-label">{f.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="size-control">
            <button
              class="size-btn"
              onclick={() => handleUiFontSizeChange(String((parseInt(uiFontSize, 10) || 13) - 1))}
              disabled={(parseInt(uiFontSize, 10) || 13) <= 8}
            >&minus;</button>
            <input
              type="number"
              min="8"
              max="24"
              value={uiFontSize || '13'}
              class="size-input"
              onchange={e => handleUiFontSizeChange((e.target as HTMLInputElement).value)}
            />
            <span class="size-unit">px</span>
            <button
              class="size-btn"
              onclick={() => handleUiFontSizeChange(String((parseInt(uiFontSize, 10) || 13) + 1))}
              disabled={(parseInt(uiFontSize, 10) || 13) >= 24}
            >+</button>
          </div>
        </div>
      </div>

      <div class="setting-field">
        <span class="setting-label">Terminal Font</span>
        <div class="setting-row">
          <div class="custom-dropdown dropdown-grow">
            <button
              class="dropdown-trigger"
              onclick={() => { termFontDropdownOpen = !termFontDropdownOpen; themeDropdownOpen = false; uiFontDropdownOpen = false; }}
              aria-haspopup="listbox"
              aria-expanded={termFontDropdownOpen}
            >
              <span class="dropdown-label" style={termFont ? `font-family: '${termFont}', monospace` : ''}>{termFontLabel}</span>
              <span class="dropdown-arrow">{termFontDropdownOpen ? '\u25B4' : '\u25BE'}</span>
            </button>
            {#if termFontDropdownOpen}
              <div class="dropdown-menu" role="listbox">
                {#each TERM_FONTS as f}
                  <button
                    class="dropdown-option"
                    class:active={f.value === termFont}
                    role="option"
                    aria-selected={f.value === termFont}
                    style={f.value ? `font-family: '${f.value}', monospace` : ''}
                    onclick={() => handleTermFontChange(f.value)}
                  >
                    <span class="dropdown-option-label">{f.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
          <div class="size-control">
            <button
              class="size-btn"
              onclick={() => handleTermFontSizeChange(String((parseInt(termFontSize, 10) || 13) - 1))}
              disabled={(parseInt(termFontSize, 10) || 13) <= 8}
            >&minus;</button>
            <input
              type="number"
              min="8"
              max="24"
              value={termFontSize || '13'}
              class="size-input"
              onchange={e => handleTermFontSizeChange((e.target as HTMLInputElement).value)}
            />
            <span class="size-unit">px</span>
            <button
              class="size-btn"
              onclick={() => handleTermFontSizeChange(String((parseInt(termFontSize, 10) || 13) + 1))}
              disabled={(parseInt(termFontSize, 10) || 13) >= 24}
            >+</button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="settings-section">
    <h2>Defaults</h2>
    <div class="settings-list">
      <div class="setting-field">
        <label for="default-shell" class="setting-label">Shell</label>
        <input
          id="default-shell"
          value={defaultShell}
          placeholder="/bin/bash"
          onchange={e => { defaultShell = (e.target as HTMLInputElement).value; saveGlobalSetting('default_shell', defaultShell); }}
        />
      </div>
      <div class="setting-field">
        <label for="default-cwd" class="setting-label">Working directory</label>
        <div class="input-with-browse">
          <input
            id="default-cwd"
            value={defaultCwd}
            placeholder="~"
            onchange={e => { defaultCwd = (e.target as HTMLInputElement).value; saveGlobalSetting('default_cwd', defaultCwd); }}
          />
          <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) { defaultCwd = d; saveGlobalSetting('default_cwd', d); } }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
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

      <div class="project-cards">
        {#each activeGroup.projects as project}
          <div class="project-card">
            <div class="card-top-row">
              <div class="icon-field">
                <button
                  class="icon-trigger"
                  onclick={() => { iconPickerOpenFor = iconPickerOpenFor === project.id ? null : project.id; }}
                  title="Choose icon"
                >{project.icon || '📁'}</button>
                {#if iconPickerOpenFor === project.id}
                  <div class="icon-picker">
                    {#each PROJECT_ICONS as emoji}
                      <button
                        class="icon-option"
                        class:active={project.icon === emoji}
                        onclick={() => {
                          updateProject(activeGroupId, project.id, { icon: emoji });
                          iconPickerOpenFor = null;
                        }}
                      >{emoji}</button>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="card-name-area">
                <input
                  class="card-name-input"
                  value={project.name}
                  placeholder="Project name"
                  onchange={e => updateProject(activeGroupId, project.id, { name: (e.target as HTMLInputElement).value })}
                />
              </div>
              <label class="card-toggle" title={project.enabled ? 'Enabled' : 'Disabled'}>
                <input
                  type="checkbox"
                  checked={project.enabled}
                  onchange={e => updateProject(activeGroupId, project.id, { enabled: (e.target as HTMLInputElement).checked })}
                />
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
              </label>
            </div>

            <div class="card-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z"/></svg>
                Path
              </span>
              <div class="input-with-browse">
                <input
                  class="cwd-input"
                  value={project.cwd}
                  placeholder="/path/to/project"
                  title={project.cwd}
                  onchange={e => updateProject(activeGroupId, project.id, { cwd: (e.target as HTMLInputElement).value })}
                />
                <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) updateProject(activeGroupId, project.id, { cwd: d }); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </div>
            </div>

            <div class="card-field profile-field">
              <span class="card-field-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Account
              </span>
              {#if profiles.length > 1}
                <div class="custom-dropdown">
                  <button
                    class="dropdown-trigger profile-trigger"
                    onclick={() => { profileDropdownOpenFor = profileDropdownOpenFor === project.id ? null : project.id; }}
                    aria-haspopup="listbox"
                    aria-expanded={profileDropdownOpenFor === project.id}
                  >
                    <span class="profile-badge">{getProfileLabel(project.profile)}</span>
                    <span class="dropdown-arrow">{profileDropdownOpenFor === project.id ? '\u25B4' : '\u25BE'}</span>
                  </button>
                  {#if profileDropdownOpenFor === project.id}
                    <div class="dropdown-menu profile-menu" role="listbox">
                      {#each profiles as prof}
                        <button
                          class="dropdown-option"
                          class:active={project.profile === prof.name}
                          role="option"
                          aria-selected={project.profile === prof.name}
                          onclick={() => {
                            updateProject(activeGroupId, project.id, { profile: prof.name });
                            profileDropdownOpenFor = null;
                          }}
                        >
                          <span class="profile-option-name">{prof.display_name || prof.name}</span>
                          {#if prof.email}
                            <span class="profile-option-email">{prof.email}</span>
                          {/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else}
                <span class="profile-single">{getProfileLabel(project.profile)}</span>
              {/if}
            </div>

            <div class="card-footer">
              <button class="btn-remove" onclick={() => removeProject(activeGroupId, project.id)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                Remove
              </button>
            </div>
          </div>
        {/each}
      </div>

      {#if activeGroup.projects.length < 5}
        <div class="add-project-form">
          <div class="add-form-row">
            <input class="add-name" bind:value={newName} placeholder="Project name" />
            <div class="input-with-browse add-form-path">
              <input bind:value={newCwd} placeholder="/path/to/project" />
              <button class="browse-btn" title="Browse..." onclick={async () => { const d = await browseDirectory(); if (d) newCwd = d; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 7v13h18V7H3zm0-2h7l2 2h9v1H3V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
            <button class="btn-primary" onclick={handleAddProject} disabled={!newName.trim() || !newCwd.trim()}>
              + Add
            </button>
          </div>
        </div>
      {:else}
        <p class="limit-notice">Maximum 5 projects per group reached.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .settings-tab {
    padding: 0.75rem 1rem;
    overflow-y: auto;
    height: 100%;
    min-width: 22em;
  }

  h2 {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-text);
    margin: 0 0 0.625rem;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .settings-section {
    margin-bottom: 1.25rem;
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .setting-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .setting-label {
    font-size: 0.7rem;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .setting-field > input,
  .setting-field .input-with-browse input {
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .setting-row {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  /* Reusable custom dropdown */
  .custom-dropdown {
    position: relative;
  }

  .dropdown-grow {
    flex: 1;
    min-width: 0;
  }

  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
    height: 100%;
  }

  .dropdown-trigger:hover {
    border-color: var(--ctp-surface2);
  }

  .dropdown-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dropdown-arrow {
    color: var(--ctp-overlay0);
    font-size: 0.7rem;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;
    min-width: 100%;
    width: max-content;
    max-height: 22.5rem;
    overflow-y: auto;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.4);
    z-index: 100;
    padding: 0.25rem 0;
  }

  .dropdown-group-label {
    padding: 0.375rem 0.625rem 0.125rem;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .dropdown-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.3125rem 0.625rem;
    background: transparent;
    border: none;
    color: var(--ctp-subtext1);
    font-size: 0.8rem;
    cursor: pointer;
    text-align: left;
    white-space: nowrap;
  }

  .dropdown-option:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .dropdown-option.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .dropdown-option-label {
    flex: 1;
  }

  /* Theme-specific dropdown extras */
  .theme-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid;
    flex-shrink: 0;
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

  /* Size control (shared by UI and Terminal font) */
  .size-control {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .size-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
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
    width: 40px;
    padding: 0.25rem 0.125rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
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
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    margin-right: 2px;
  }

  /* Groups */
  .group-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .group-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.625rem;
    background: var(--ctp-surface0);
    border-radius: 0.25rem;
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

  /* Project Cards */
  .project-cards {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .project-card {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.5rem;
    padding: 0.625rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: border-color 0.15s;
  }

  .project-card:hover {
    border-color: var(--ctp-surface2);
  }

  .card-top-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .card-name-area {
    flex: 1;
    min-width: 0;
  }

  .card-name-input {
    width: 100%;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.85rem;
    font-weight: 600;
    transition: border-color 0.15s, background 0.15s;
  }

  .card-name-input:hover {
    background: var(--ctp-base);
    border-color: var(--ctp-surface1);
  }

  .card-name-input:focus {
    background: var(--ctp-base);
    border-color: var(--ctp-blue);
    outline: none;
  }

  /* Toggle switch */
  .card-toggle {
    position: relative;
    cursor: pointer;
    flex-shrink: 0;
  }

  .card-toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    display: block;
    width: 2rem;
    height: 1.125rem;
    background: var(--ctp-surface2);
    border-radius: 0.5625rem;
    transition: background 0.2s;
    position: relative;
  }

  .card-toggle input:checked + .toggle-track {
    background: var(--ctp-green);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 0.875rem;
    height: 0.875rem;
    background: var(--ctp-text);
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .card-toggle input:checked + .toggle-track .toggle-thumb {
    transform: translateX(0.875rem);
  }

  /* Card fields */
  .card-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .card-field-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .card-field-label svg {
    flex-shrink: 0;
    opacity: 0.6;
  }

  .card-field .input-with-browse input {
    padding: 0.3125rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.78rem;
    font-family: var(--term-font-family, monospace);
  }

  /* CWD input: left-ellipsis */
  .cwd-input {
    direction: rtl;
    text-align: left;
    unicode-bidi: plaintext;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  /* Profile field */
  .profile-trigger {
    padding: 0.25rem 0.5rem;
    background: var(--ctp-base);
    font-size: 0.78rem;
  }

  .profile-badge {
    font-weight: 600;
    color: var(--ctp-blue);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-single {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--ctp-blue);
    padding: 0.25rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
  }

  .profile-menu {
    min-width: 12rem;
  }

  .profile-option-name {
    font-weight: 500;
    color: var(--ctp-text);
  }

  .profile-option-email {
    font-size: 0.7rem;
    color: var(--ctp-overlay0);
    margin-left: auto;
  }

  /* Card footer */
  .card-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 0.25rem;
    border-top: 1px solid var(--ctp-surface1);
    margin-top: 0.125rem;
  }

  .btn-remove {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    color: var(--ctp-overlay0);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }

  .btn-remove:hover {
    color: var(--ctp-red);
    background: color-mix(in srgb, var(--ctp-red) 8%, transparent);
  }

  /* Icon field & picker */
  .icon-field {
    position: relative;
    flex-shrink: 0;
  }

  .icon-trigger {
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    font-size: 1.1rem;
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .icon-trigger:hover {
    border-color: var(--ctp-overlay0);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--ctp-blue) 15%, transparent);
  }

  .icon-picker {
    display: grid;
    position: absolute;
    top: calc(100% + 0.375rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    background: var(--ctp-mantle);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.5rem;
    padding: 0.5rem;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
    box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
    width: max-content;
  }

  .icon-option {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background 0.1s, transform 0.1s;
  }

  .icon-option:hover {
    background: var(--ctp-surface0);
    transform: scale(1.15);
  }

  .icon-option.active {
    background: var(--ctp-surface1);
    border-color: var(--ctp-blue);
  }

  /* Add project form */
  .add-project-form {
    margin-top: 0.625rem;
    padding: 0.5rem 0.625rem;
    background: var(--ctp-mantle);
    border: 1px dashed var(--ctp-surface1);
    border-radius: 0.5rem;
  }

  .add-form-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    min-width: 0;
  }

  .add-name {
    width: 8rem;
    flex-shrink: 0;
    padding: 0.3125rem 0.625rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .add-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.5rem;
    min-width: 0;
  }

  .add-form input {
    padding: 0.3125rem 0.625rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
    flex: 1;
    min-width: 0;
  }

  .btn-primary {
    padding: 0.3125rem 0.875rem;
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-danger {
    padding: 0.25rem 0.625rem;
    background: transparent;
    color: var(--ctp-red);
    border: 1px solid var(--ctp-red);
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .limit-notice {
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    font-style: italic;
    margin-top: 0.5rem;
  }

  .input-with-browse {
    display: flex;
    gap: 0.25rem;
    align-items: stretch;
  }

  .input-with-browse input {
    flex: 1;
    min-width: 0;
  }

  .add-form-path {
    flex: 1;
    min-width: 0;
  }

  .add-form-path input {
    padding: 0.3125rem 0.625rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.8rem;
  }

  .browse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 0.5rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    cursor: pointer;
    flex-shrink: 0;
  }

  .browse-btn:hover {
    color: var(--ctp-text);
    background: var(--ctp-surface1);
  }
</style>
