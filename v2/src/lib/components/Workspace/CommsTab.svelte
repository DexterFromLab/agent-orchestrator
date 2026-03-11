<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getActiveGroup } from '../../stores/workspace.svelte';
  import {
    type BtmsgAgent,
    type BtmsgMessage,
    type BtmsgFeedMessage,
    type BtmsgChannel,
    type BtmsgChannelMessage,
    getGroupAgents,
    getHistory,
    getAllFeed,
    sendMessage,
    markRead,
    ensureAdmin,
    getChannels,
    getChannelMessages,
    sendChannelMessage,
    createChannel,
  } from '../../adapters/btmsg-bridge';

  const ADMIN_ID = 'admin';
  const ROLE_ICONS: Record<string, string> = {
    admin: '👤',
    manager: '🎯',
    architect: '🏗',
    tester: '🧪',
    reviewer: '🔍',
    project: '📦',
  };

  type ViewMode =
    | { type: 'feed' }
    | { type: 'dm'; agentId: string; agentName: string }
    | { type: 'channel'; channelId: string; channelName: string };

  let agents = $state<BtmsgAgent[]>([]);
  let channels = $state<BtmsgChannel[]>([]);
  let currentView = $state<ViewMode>({ type: 'feed' });
  let feedMessages = $state<BtmsgFeedMessage[]>([]);
  let dmMessages = $state<BtmsgMessage[]>([]);
  let channelMessages = $state<BtmsgChannelMessage[]>([]);
  let messageInput = $state('');
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let messagesEl: HTMLElement | undefined = $state();
  let newChannelName = $state('');
  let showNewChannel = $state(false);

  let group = $derived(getActiveGroup());
  let groupId = $derived(group?.id ?? '');

  async function loadData() {
    if (!groupId) return;
    try {
      agents = await getGroupAgents(groupId);
      channels = await getChannels(groupId);
    } catch {
      // btmsg.db might not exist
    }
  }

  async function loadMessages() {
    if (!groupId) return;
    try {
      if (currentView.type === 'feed') {
        feedMessages = await getAllFeed(groupId, 100);
      } else if (currentView.type === 'dm') {
        dmMessages = await getHistory(ADMIN_ID, currentView.agentId, 100);
        await markRead(ADMIN_ID, currentView.agentId);
      } else if (currentView.type === 'channel') {
        channelMessages = await getChannelMessages(currentView.channelId, 100);
      }
    } catch {
      // silently fail
    }
  }

  function scrollToBottom() {
    if (messagesEl) {
      requestAnimationFrame(() => {
        if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
      });
    }
  }

  $effect(() => {
    void currentView;
    loadMessages().then(scrollToBottom);
  });

  $effect(() => {
    void groupId;
    if (groupId) {
      ensureAdmin(groupId).catch(() => {});
      loadData();
    }
  });

  onMount(() => {
    pollTimer = setInterval(() => {
      loadData();
      loadMessages();
    }, 3000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  function selectFeed() {
    currentView = { type: 'feed' };
  }

  function selectDm(agent: BtmsgAgent) {
    currentView = { type: 'dm', agentId: agent.id, agentName: agent.name };
  }

  function selectChannel(channel: BtmsgChannel) {
    currentView = { type: 'channel', channelId: channel.id, channelName: channel.name };
  }

  async function handleSend() {
    const text = messageInput.trim();
    if (!text) return;

    try {
      if (currentView.type === 'dm') {
        await sendMessage(ADMIN_ID, currentView.agentId, text);
      } else if (currentView.type === 'channel') {
        await sendChannelMessage(currentView.channelId, ADMIN_ID, text);
      } else {
        return; // Can't send in feed view
      }
      messageInput = '';
      await loadMessages();
      scrollToBottom();
    } catch (e) {
      console.warn('Failed to send message:', e);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleCreateChannel() {
    const name = newChannelName.trim();
    if (!name || !groupId) return;
    try {
      await createChannel(name, groupId, ADMIN_ID);
      newChannelName = '';
      showNewChannel = false;
      await loadData();
    } catch (e) {
      console.warn('Failed to create channel:', e);
    }
  }

  function formatTime(ts: string): string {
    try {
      const d = new Date(ts + 'Z');
      return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts.slice(11, 16);
    }
  }

  function getAgentIcon(role: string): string {
    return ROLE_ICONS[role] ?? '🤖';
  }

  function isActive(view: ViewMode): boolean {
    if (currentView.type !== view.type) return false;
    if (view.type === 'dm' && currentView.type === 'dm') return view.agentId === currentView.agentId;
    if (view.type === 'channel' && currentView.type === 'channel') return view.channelId === currentView.channelId;
    return true;
  }
</script>

<div class="comms-tab">
  <!-- Conversation list -->
  <div class="conv-list">
    <div class="conv-header">
      <span class="conv-header-title">Messages</span>
    </div>

    <!-- Activity Feed -->
    <button
      class="conv-item"
      class:active={currentView.type === 'feed'}
      onclick={selectFeed}
    >
      <span class="conv-icon">📡</span>
      <span class="conv-name">Activity Feed</span>
    </button>

    <!-- Channels -->
    {#if channels.length > 0 || showNewChannel}
      <div class="conv-section-title">
        <span>Channels</span>
        <button class="add-btn" onclick={() => showNewChannel = !showNewChannel} title="New channel">+</button>
      </div>
      {#each channels as channel (channel.id)}
        <button
          class="conv-item"
          class:active={currentView.type === 'channel' && currentView.channelId === channel.id}
          onclick={() => selectChannel(channel)}
        >
          <span class="conv-icon">#</span>
          <span class="conv-name">{channel.name}</span>
          <span class="conv-meta">{channel.memberCount}</span>
        </button>
      {/each}
      {#if showNewChannel}
        <div class="new-channel">
          <input
            type="text"
            placeholder="channel name"
            bind:value={newChannelName}
            onkeydown={(e) => { if (e.key === 'Enter') handleCreateChannel(); }}
          />
          <button onclick={handleCreateChannel}>OK</button>
        </div>
      {/if}
    {:else}
      <div class="conv-section-title">
        <span>Channels</span>
        <button class="add-btn" onclick={() => showNewChannel = !showNewChannel} title="New channel">+</button>
      </div>
      {#if showNewChannel}
        <div class="new-channel">
          <input
            type="text"
            placeholder="channel name"
            bind:value={newChannelName}
            onkeydown={(e) => { if (e.key === 'Enter') handleCreateChannel(); }}
          />
          <button onclick={handleCreateChannel}>OK</button>
        </div>
      {/if}
    {/if}

    <!-- Direct Messages -->
    <div class="conv-section-title">
      <span>Direct Messages</span>
    </div>
    {#each agents.filter(a => a.id !== ADMIN_ID) as agent (agent.id)}
      {@const statusClass = agent.status === 'active' ? 'active' : agent.status === 'sleeping' ? 'sleeping' : 'stopped'}
      <button
        class="conv-item"
        class:active={currentView.type === 'dm' && currentView.agentId === agent.id}
        onclick={() => selectDm(agent)}
      >
        <span class="conv-icon">{getAgentIcon(agent.role)}</span>
        <span class="conv-name">{agent.name}</span>
        <span class="status-dot {statusClass}"></span>
        {#if agent.unreadCount > 0}
          <span class="unread-badge">{agent.unreadCount}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Chat area -->
  <div class="chat-area">
    <div class="chat-header">
      {#if currentView.type === 'feed'}
        <span class="chat-title">📡 Activity Feed</span>
        <span class="chat-subtitle">All agent communication</span>
      {:else if currentView.type === 'dm'}
        <span class="chat-title">DM with {currentView.agentName}</span>
      {:else if currentView.type === 'channel'}
        <span class="chat-title"># {currentView.channelName}</span>
      {/if}
    </div>

    <div class="chat-messages" bind:this={messagesEl}>
      {#if currentView.type === 'feed'}
        {#if feedMessages.length === 0}
          <div class="empty-state">No messages yet. Agents haven't started communicating.</div>
        {:else}
          {#each [...feedMessages].reverse() as msg (msg.id)}
            <div class="message feed-message">
              <div class="msg-header">
                <span class="msg-icon">{getAgentIcon(msg.senderRole)}</span>
                <span class="msg-sender">{msg.senderName}</span>
                <span class="msg-arrow">→</span>
                <span class="msg-recipient">{msg.recipientName}</span>
                <span class="msg-time">{formatTime(msg.createdAt)}</span>
              </div>
              <div class="msg-content">{msg.content}</div>
            </div>
          {/each}
        {/if}

      {:else if currentView.type === 'dm'}
        {#if dmMessages.length === 0}
          <div class="empty-state">No messages yet. Start the conversation!</div>
        {:else}
          {#each dmMessages as msg (msg.id)}
            {@const isMe = msg.fromAgent === ADMIN_ID}
            <div class="message" class:own={isMe}>
              <div class="msg-header">
                <span class="msg-sender">{isMe ? 'You' : (msg.senderName ?? msg.fromAgent)}</span>
                <span class="msg-time">{formatTime(msg.createdAt)}</span>
              </div>
              <div class="msg-content">{msg.content}</div>
            </div>
          {/each}
        {/if}

      {:else if currentView.type === 'channel'}
        {#if channelMessages.length === 0}
          <div class="empty-state">No messages in this channel yet.</div>
        {:else}
          {#each channelMessages as msg (msg.id)}
            {@const isMe = msg.fromAgent === ADMIN_ID}
            <div class="message" class:own={isMe}>
              <div class="msg-header">
                <span class="msg-icon">{getAgentIcon(msg.senderRole)}</span>
                <span class="msg-sender">{isMe ? 'You' : msg.senderName}</span>
                <span class="msg-time">{formatTime(msg.createdAt)}</span>
              </div>
              <div class="msg-content">{msg.content}</div>
            </div>
          {/each}
        {/if}
      {/if}
    </div>

    {#if currentView.type !== 'feed'}
      <div class="chat-input">
        <textarea
          placeholder={currentView.type === 'dm' ? `Message ${currentView.agentName}...` : `Message #${currentView.channelName}...`}
          bind:value={messageInput}
          onkeydown={handleKeydown}
          rows="1"
        ></textarea>
        <button class="send-btn" onclick={handleSend} disabled={!messageInput.trim()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .comms-tab {
    display: flex;
    min-width: 36rem;
    height: 100%;
  }

  /* Conversation list */
  .conv-list {
    width: 13rem;
    flex-shrink: 0;
    border-right: 1px solid var(--ctp-surface0);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .conv-header {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
  }

  .conv-header-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ctp-subtext0);
  }

  .conv-section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem 0.25rem;
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ctp-overlay0);
  }

  .add-btn {
    background: transparent;
    border: none;
    color: var(--ctp-overlay0);
    font-size: 0.8rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .add-btn:hover {
    color: var(--ctp-text);
  }

  .conv-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    padding: 0.35rem 0.75rem;
    background: transparent;
    border: none;
    color: var(--ctp-subtext0);
    font-size: 0.75rem;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s, color 0.1s;
  }

  .conv-item:hover {
    background: var(--ctp-surface0);
    color: var(--ctp-text);
  }

  .conv-item.active {
    background: color-mix(in srgb, var(--ctp-blue) 15%, transparent);
    color: var(--ctp-text);
  }

  .conv-icon {
    font-size: 0.8rem;
    flex-shrink: 0;
    width: 1.2rem;
    text-align: center;
  }

  .conv-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conv-meta {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.active {
    background: var(--ctp-green);
    box-shadow: 0 0 4px var(--ctp-green);
  }

  .status-dot.sleeping {
    background: var(--ctp-yellow);
  }

  .status-dot.stopped {
    background: var(--ctp-overlay0);
  }

  .unread-badge {
    background: var(--ctp-red);
    color: var(--ctp-base);
    border-radius: 0.5rem;
    padding: 0 0.3rem;
    font-size: 0.55rem;
    font-weight: 700;
    min-width: 0.9rem;
    text-align: center;
    flex-shrink: 0;
  }

  .new-channel {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem 0.75rem;
  }

  .new-channel input {
    flex: 1;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.2rem;
    color: var(--ctp-text);
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
    outline: none;
  }

  .new-channel input:focus {
    border-color: var(--ctp-blue);
  }

  .new-channel button {
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 0.2rem;
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0.2rem 0.4rem;
    cursor: pointer;
  }

  /* Chat area */
  .chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .chat-header {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .chat-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .chat-subtitle {
    font-size: 0.65rem;
    color: var(--ctp-overlay0);
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .empty-state {
    color: var(--ctp-overlay0);
    font-size: 0.75rem;
    text-align: center;
    padding: 2rem 1rem;
  }

  .message {
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    background: var(--ctp-surface0);
    max-width: 85%;
  }

  .message.own {
    align-self: flex-end;
    background: color-mix(in srgb, var(--ctp-blue) 20%, var(--ctp-surface0));
  }

  .message.feed-message {
    max-width: 100%;
    background: transparent;
    border-left: 2px solid var(--ctp-surface1);
    border-radius: 0;
    padding: 0.3rem 0.6rem;
  }

  .msg-header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.15rem;
  }

  .msg-icon {
    font-size: 0.7rem;
  }

  .msg-sender {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-text);
  }

  .msg-arrow {
    font-size: 0.6rem;
    color: var(--ctp-overlay0);
  }

  .msg-recipient {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--ctp-subtext0);
  }

  .msg-time {
    font-size: 0.55rem;
    color: var(--ctp-overlay0);
    margin-left: auto;
  }

  .msg-content {
    font-size: 0.75rem;
    color: var(--ctp-subtext0);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
  }

  .message.own .msg-content {
    color: var(--ctp-text);
  }

  /* Input */
  .chat-input {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem;
    border-top: 1px solid var(--ctp-surface0);
    flex-shrink: 0;
  }

  .chat-input textarea {
    flex: 1;
    background: var(--ctp-surface0);
    border: 1px solid var(--ctp-surface1);
    border-radius: 0.375rem;
    color: var(--ctp-text);
    font-size: 0.75rem;
    font-family: inherit;
    padding: 0.4rem 0.6rem;
    resize: none;
    outline: none;
    line-height: 1.4;
  }

  .chat-input textarea:focus {
    border-color: var(--ctp-blue);
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: var(--ctp-blue);
    color: var(--ctp-base);
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.1s;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .send-btn:not(:disabled):hover {
    opacity: 0.9;
  }
</style>
