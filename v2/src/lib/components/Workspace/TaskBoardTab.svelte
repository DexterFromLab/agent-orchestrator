<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listTasks, updateTaskStatus, createTask, deleteTask, addTaskComment, type Task, type TaskComment, getTaskComments } from '../../adapters/bttask-bridge';

  interface Props {
    groupId: string;
    projectId?: string;
  }

  let { groupId, projectId }: Props = $props();

  const STATUSES = ['todo', 'progress', 'review', 'done', 'blocked'] as const;
  const STATUS_LABELS: Record<string, string> = {
    todo: 'To Do',
    progress: 'In Progress',
    review: 'Review',
    done: 'Done',
    blocked: 'Blocked',
  };
  const STATUS_ICONS: Record<string, string> = {
    todo: '○',
    progress: '◐',
    review: '◑',
    done: '●',
    blocked: '✗',
  };
  const PRIORITY_LABELS: Record<string, string> = {
    critical: 'CRIT',
    high: 'HIGH',
    medium: 'MED',
    low: 'LOW',
  };

  let tasks = $state<Task[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // New task form
  let showAddForm = $state(false);
  let newTitle = $state('');
  let newDesc = $state('');
  let newPriority = $state('medium');

  // Expanded task detail
  let expandedTaskId = $state<string | null>(null);
  let taskComments = $state<TaskComment[]>([]);
  let newComment = $state('');

  let tasksByStatus = $derived.by(() => {
    const map: Record<string, Task[]> = {};
    for (const s of STATUSES) map[s] = [];
    for (const t of tasks) {
      if (map[t.status]) map[t.status].push(t);
    }
    return map;
  });

  let pendingCount = $derived(
    tasks.filter(t => t.status !== 'done').length
  );

  async function loadTasks() {
    try {
      tasks = await listTasks(groupId);
      error = null;
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadTasks();
    pollTimer = setInterval(loadTasks, 5000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  async function handleStatusChange(taskId: string, newStatus: string) {
    try {
      await updateTaskStatus(taskId, newStatus);
      await loadTasks();
    } catch (e) {
      console.warn('Failed to update task status:', e);
    }
  }

  async function handleAddTask() {
    if (!newTitle.trim()) return;
    try {
      await createTask(newTitle.trim(), newDesc.trim(), newPriority, groupId, 'admin');
      newTitle = '';
      newDesc = '';
      newPriority = 'medium';
      showAddForm = false;
      await loadTasks();
    } catch (e) {
      console.warn('Failed to create task:', e);
    }
  }

  async function handleDelete(taskId: string) {
    try {
      await deleteTask(taskId);
      if (expandedTaskId === taskId) expandedTaskId = null;
      await loadTasks();
    } catch (e) {
      console.warn('Failed to delete task:', e);
    }
  }

  async function toggleExpand(taskId: string) {
    if (expandedTaskId === taskId) {
      expandedTaskId = null;
      return;
    }
    expandedTaskId = taskId;
    try {
      taskComments = await getTaskComments(taskId);
    } catch {
      taskComments = [];
    }
  }

  async function handleAddComment() {
    if (!expandedTaskId || !newComment.trim()) return;
    try {
      await addTaskComment(expandedTaskId, 'admin', newComment.trim());
      newComment = '';
      taskComments = await getTaskComments(expandedTaskId);
    } catch (e) {
      console.warn('Failed to add comment:', e);
    }
  }
</script>

<div class="task-board-tab">
  <div class="board-header">
    <span class="board-title">Task Board</span>
    <span class="pending-badge" class:all-done={pendingCount === 0}>
      {pendingCount === 0 ? 'All done' : `${pendingCount} pending`}
    </span>
    <button class="btn-add" onclick={() => showAddForm = !showAddForm}>
      {showAddForm ? '✕' : '+ Task'}
    </button>
  </div>

  {#if showAddForm}
    <div class="add-task-form">
      <input
        class="task-title-input"
        bind:value={newTitle}
        placeholder="Task title"
        onkeydown={e => { if (e.key === 'Enter') handleAddTask(); }}
      />
      <textarea
        class="task-desc-input"
        bind:value={newDesc}
        placeholder="Description (optional)"
        rows="2"
      ></textarea>
      <div class="form-row">
        <select class="priority-select" bind:value={newPriority}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <button class="btn-create" onclick={handleAddTask} disabled={!newTitle.trim()}>Create</button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading tasks...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="kanban">
      {#each STATUSES as status}
        <div class="kanban-column">
          <div class="column-header">
            <span class="column-icon">{STATUS_ICONS[status]}</span>
            <span class="column-title">{STATUS_LABELS[status]}</span>
            <span class="column-count">{tasksByStatus[status].length}</span>
          </div>
          <div class="column-cards">
            {#each tasksByStatus[status] as task (task.id)}
              <div
                class="task-card"
                class:expanded={expandedTaskId === task.id}
                class:critical={task.priority === 'critical'}
                class:high={task.priority === 'high'}
              >
                <button class="task-card-body" onclick={() => toggleExpand(task.id)}>
                  <span class="task-priority priority-{task.priority}">{PRIORITY_LABELS[task.priority]}</span>
                  <span class="task-title">{task.title}</span>
                  {#if task.assignedTo}
                    <span class="task-assignee">{task.assignedTo}</span>
                  {/if}
                </button>

                {#if expandedTaskId === task.id}
                  <div class="task-detail">
                    {#if task.description}
                      <p class="task-description">{task.description}</p>
                    {/if}

                    <div class="status-actions">
                      {#each STATUSES as s}
                        <button
                          class="status-btn"
                          class:active={task.status === s}
                          onclick={() => handleStatusChange(task.id, s)}
                        >{STATUS_ICONS[s]} {STATUS_LABELS[s]}</button>
                      {/each}
                    </div>

                    {#if taskComments.length > 0}
                      <div class="comments-list">
                        {#each taskComments as comment}
                          <div class="comment">
                            <span class="comment-agent">{comment.agentId}</span>
                            <span class="comment-text">{comment.content}</span>
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <div class="comment-form">
                      <input
                        class="comment-input"
                        bind:value={newComment}
                        placeholder="Add comment..."
                        onkeydown={e => { if (e.key === 'Enter') handleAddComment(); }}
                      />
                    </div>

                    <button class="btn-delete" onclick={() => handleDelete(task.id)}>Delete</button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .task-board-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    padding: 0.5rem;
    gap: 0.5rem;
  }

  .board-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .board-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .pending-badge {
    font-size: 0.65rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--ctp-yellow) 15%, transparent);
    color: var(--ctp-yellow);
    font-weight: 600;
  }

  .pending-badge.all-done {
    background: color-mix(in srgb, var(--ctp-green) 15%, transparent);
    color: var(--ctp-green);
  }

  .btn-add {
    margin-left: auto;
    padding: 0.2rem 0.5rem;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-subtext0);
    font-size: 0.7rem;
    cursor: pointer;
  }

  .btn-add:hover {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
  }

  .add-task-form {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    background: var(--ctp-surface0);
    border-radius: 0.375rem;
    flex-shrink: 0;
  }

  .task-title-input, .task-desc-input, .comment-input {
    padding: 0.3125rem 0.5rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.75rem;
  }

  .task-desc-input {
    resize: vertical;
    min-height: 2rem;
    font-family: var(--ui-font-family, sans-serif);
  }

  .form-row {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .priority-select {
    padding: 0.25rem 0.375rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-text);
    font-size: 0.7rem;
  }

  .btn-create {
    padding: 0.25rem 0.625rem;
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-create:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .loading, .error {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: 0.8rem;
    color: var(--ctp-overlay0);
  }

  .error { color: var(--ctp-red); }

  .kanban {
    display: flex;
    gap: 0.375rem;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .kanban-column {
    flex: 1;
    min-width: 8rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.375rem;
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--ctp-overlay0);
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .column-icon { font-size: 0.7rem; }

  .column-count {
    margin-left: auto;
    font-size: 0.55rem;
    background: var(--ctp-surface0);
    padding: 0 0.25rem;
    border-radius: 0.5rem;
  }

  .column-cards {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.25rem 0;
  }

  .task-card {
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    transition: border-color 0.15s;
  }

  .task-card:hover {
    border-color: var(--ctp-surface2);
  }

  .task-card.critical {
    border-left: 2px solid var(--ctp-red);
  }

  .task-card.high {
    border-left: 2px solid var(--ctp-yellow);
  }

  .task-card-body {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    padding: 0.3125rem 0.375rem;
    background: transparent;
    border: none;
    color: var(--ctp-text);
    font-size: 0.7rem;
    text-align: left;
    cursor: pointer;
    width: 100%;
  }

  .task-priority {
    font-size: 0.5rem;
    font-weight: 700;
    padding: 0.0625rem 0.25rem;
    border-radius: 0.125rem;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  .priority-critical { background: var(--ctp-red); color: var(--ctp-base); }
  .priority-high { background: var(--ctp-yellow); color: var(--ctp-base); }
  .priority-medium { background: var(--ctp-surface1); color: var(--ctp-subtext0); }
  .priority-low { background: var(--ctp-surface0); color: var(--ctp-overlay0); }

  .task-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-assignee {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    background: var(--ctp-base);
    padding: 0.0625rem 0.25rem;
    border-radius: 0.125rem;
  }

  .task-detail {
    padding: 0.375rem;
    border-top: 1px solid var(--ctp-surface1);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .task-description {
    margin: 0;
    font-size: 0.7rem;
    color: var(--ctp-subtext0);
    line-height: 1.4;
  }

  .status-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .status-btn {
    padding: 0.125rem 0.375rem;
    background: var(--ctp-base);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.25rem;
    color: var(--ctp-overlay0);
    font-size: 0.6rem;
    cursor: pointer;
  }

  .status-btn.active {
    background: var(--ctp-surface1);
    color: var(--ctp-text);
    font-weight: 600;
  }

  .status-btn:hover {
    border-color: var(--ctp-surface2);
    color: var(--ctp-text);
  }

  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 8rem;
    overflow-y: auto;
  }

  .comment {
    font-size: 0.65rem;
    color: var(--ctp-subtext0);
  }

  .comment-agent {
    font-weight: 600;
    color: var(--ctp-blue);
    margin-right: 0.25rem;
  }

  .comment-form {
    display: flex;
    gap: 0.25rem;
  }

  .comment-input {
    flex: 1;
    font-size: 0.65rem;
  }

  .btn-delete {
    align-self: flex-end;
    padding: 0.125rem 0.375rem;
    background: transparent;
    border: none;
    color: var(--ctp-overlay0);
    font-size: 0.6rem;
    cursor: pointer;
  }

  .btn-delete:hover {
    color: var(--ctp-red);
  }
</style>
