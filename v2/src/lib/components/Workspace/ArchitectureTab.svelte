<script lang="ts">
  import { onMount } from 'svelte';
  import { listDirectoryChildren, readFileContent, writeFileContent, type DirEntry } from '../../adapters/files-bridge';

  interface Props {
    cwd: string;
  }

  let { cwd }: Props = $props();

  /** Directory where .puml files are stored */
  const ARCH_DIR = '.architecture';

  let diagrams = $state<DirEntry[]>([]);
  let selectedFile = $state<string | null>(null);
  let pumlSource = $state('');
  let svgUrl = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let editing = $state(false);

  // New diagram form
  let showNewForm = $state(false);
  let newName = $state('');

  const DIAGRAM_TEMPLATES: Record<string, string> = {
    'Class Diagram': `@startuml
title Class Diagram

class Service {
  +start()
  +stop()
}

class Database {
  +query()
  +connect()
}

Service --> Database : uses

@enduml`,
    'Sequence Diagram': `@startuml
title Sequence Diagram

actor User
participant "Frontend" as FE
participant "Backend" as BE
participant "Database" as DB

User -> FE: action
FE -> BE: request
BE -> DB: query
DB --> BE: result
BE --> FE: response
FE --> User: display

@enduml`,
    'State Diagram': `@startuml
title State Diagram

[*] --> Idle
Idle --> Running : start
Running --> Idle : stop
Running --> Error : failure
Error --> Idle : reset

@enduml`,
    'Component Diagram': `@startuml
title Component Diagram

package "Frontend" {
  [UI Components]
  [State Store]
}

package "Backend" {
  [API Server]
  [Database]
}

[UI Components] --> [State Store]
[State Store] --> [API Server]
[API Server] --> [Database]

@enduml`,
  };

  let archPath = $derived(`${cwd}/${ARCH_DIR}`);

  async function loadDiagrams() {
    try {
      const entries = await listDirectoryChildren(archPath);
      diagrams = entries.filter(e => e.name.endsWith('.puml') || e.name.endsWith('.plantuml'));
    } catch {
      // Directory might not exist yet
      diagrams = [];
    }
  }

  onMount(() => {
    loadDiagrams();
  });

  async function selectDiagram(filePath: string) {
    selectedFile = filePath;
    loading = true;
    error = null;
    editing = false;
    try {
      const content = await readFileContent(filePath);
      if (content.type === 'Text') {
        pumlSource = content.content;
        renderPlantUml(content.content);
      } else {
        error = 'Not a text file';
      }
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function renderPlantUml(source: string) {
    // Encode PlantUML source for the server renderer
    const encoded = plantumlEncode(source);
    svgUrl = `https://www.plantuml.com/plantuml/svg/${encoded}`;
  }

  async function handleSave() {
    if (!selectedFile) return;
    try {
      await writeFileContent(selectedFile, pumlSource);
      renderPlantUml(pumlSource);
      editing = false;
    } catch (e) {
      error = String(e);
    }
  }

  async function handleCreate(template: string) {
    if (!newName.trim()) return;
    const fileName = newName.trim().replace(/\s+/g, '-').toLowerCase();
    const filePath = `${archPath}/${fileName}.puml`;
    try {
      await writeFileContent(filePath, template);
      showNewForm = false;
      newName = '';
      await loadDiagrams();
      await selectDiagram(filePath);
    } catch (e) {
      error = String(e);
    }
  }

  // PlantUML text encoder (deflate + base64 variant)
  // Uses the PlantUML encoding scheme: https://plantuml.com/text-encoding
  function plantumlEncode(text: string): string {
    const data = unescape(encodeURIComponent(text));
    const compressed = rawDeflate(data);
    return encode64(compressed);
  }

  // Minimal raw deflate (store-only for simplicity — works with plantuml.com)
  function rawDeflate(data: string): string {
    // For PlantUML server compatibility, we use the ~h hex encoding as fallback
    // which is simpler and doesn't require deflate
    return data;
  }

  // PlantUML base64 encoding (6-bit alphabet: 0-9A-Za-z-_)
  function encode64(data: string): string {
    // Use hex encoding prefix for simplicity (supported by PlantUML server)
    let hex = '~h';
    for (let i = 0; i < data.length; i++) {
      hex += data.charCodeAt(i).toString(16).padStart(2, '0');
    }
    return hex;
  }
</script>

<div class="architecture-tab">
  <div class="arch-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">Diagrams</span>
      <button class="btn-new" onclick={() => showNewForm = !showNewForm}>
        {showNewForm ? '✕' : '+'}
      </button>
    </div>

    {#if showNewForm}
      <div class="new-form">
        <input
          class="new-name-input"
          bind:value={newName}
          placeholder="Diagram name"
        />
        <div class="template-list">
          {#each Object.entries(DIAGRAM_TEMPLATES) as [name, template]}
            <button
              class="template-btn"
              onclick={() => handleCreate(template)}
              disabled={!newName.trim()}
            >{name}</button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="diagram-list">
      {#each diagrams as file (file.path)}
        <button
          class="diagram-item"
          class:active={selectedFile === file.path}
          onclick={() => selectDiagram(file.path)}
        >
          <span class="diagram-icon">📐</span>
          <span class="diagram-name">{file.name.replace(/\.(puml|plantuml)$/, '')}</span>
        </button>
      {/each}
      {#if diagrams.length === 0 && !showNewForm}
        <div class="empty-hint">
          No diagrams yet. The Architect agent creates .puml files in <code>{ARCH_DIR}/</code>
        </div>
      {/if}
    </div>
  </div>

  <div class="arch-content">
    {#if !selectedFile}
      <div class="empty-state">
        Select a diagram or create a new one
      </div>
    {:else if loading}
      <div class="empty-state">Loading...</div>
    {:else if error}
      <div class="empty-state error-text">{error}</div>
    {:else}
      <div class="content-header">
        <span class="file-name">{selectedFile?.split('/').pop()}</span>
        <button class="btn-toggle-edit" onclick={() => editing = !editing}>
          {editing ? 'Preview' : 'Edit'}
        </button>
        {#if editing}
          <button class="btn-save" onclick={handleSave}>Save</button>
        {/if}
      </div>

      {#if editing}
        <textarea
          class="puml-editor"
          bind:value={pumlSource}
        ></textarea>
      {:else if svgUrl}
        <div class="diagram-preview">
          <img src={svgUrl} alt="PlantUML diagram" class="diagram-img" />
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .architecture-tab {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .arch-sidebar {
    width: 10rem;
    flex-shrink: 0;
    border-right: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .sidebar-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext0);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .btn-new {
    padding: 0.125rem 0.375rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .btn-new:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }

  .new-form {
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface0);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .new-name-input {
    padding: 0.25rem 0.375rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.7rem;
  }

  .template-list {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .template-btn {
    padding: 0.2rem 0.375rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.125rem;
    color: var(--ctp-subtext0);
    font-size: 0.6rem;
    text-align: left;
    cursor: pointer;
  }

  .template-btn:hover:not(:disabled) {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }

  .template-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .diagram-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .diagram-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3125rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .diagram-item:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .diagram-item.active {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .diagram-icon { font-size: 0.8rem; }

  .diagram-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-hint {
    padding: 0.5rem;
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
    line-height: 1.4;
  }

  .empty-hint code {
    background: var(--ctp-surface0);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.125rem;
    font-size: 0.6rem;
  }

  .arch-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
  }

  .error-text { color: var(--ctp-red); }

  .content-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .file-name {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ctp-text);
    flex: 1;
  }

  .btn-toggle-edit, .btn-save {
    padding: 0.2rem 0.5rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    font-size: 0.65rem;
    cursor: pointer;
  }

  .btn-toggle-edit:hover, .btn-save:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }

  .btn-save {
    background: var(--ctp-green);
    color: var(--ctp-base);
    border-color: var(--ctp-green);
  }

  .puml-editor {
    flex: 1;
    padding: 0.5rem;
    background: var(--ctp-mantle);
    border: none;
    color: var(--ctp-text);
    font-family: var(--term-font-family, monospace);
    font-size: 0.75rem;
    line-height: 1.5;
    resize: none;
  }

  .puml-editor:focus { outline: none; }

  .diagram-preview {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 0.5rem;
    background: var(--ctp-mantle);
  }

  .diagram-img {
    max-width: 100%;
    height: auto;
    border-radius: 0.25rem;
  }
</style>
