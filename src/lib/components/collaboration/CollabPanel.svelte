<script lang="ts">
  import {
    comments3D, highlightedCommentObjectId, focusedCommentId,
    activeUser, activeUserId,
    visibleSessions, activeSession, activeSessionId,
    cancelComment, commitFix, resolveComment, addReply, toggleClientVisible,
    renameSession, createSession, setActiveSessionId,
    collabUsers, isClientRole, hasProjectApprover,
  } from '$lib/stores/collaboration';
  import { currentProject } from '$lib/stores/project';
  import type { Comment3D, ReviewSession, SessionVisibility } from '$lib/stores/collaboration';
  import { timeElapsed } from '$lib/utils/timeElapsed';
  import LogTable from '$lib/components/collaboration/LogTable.svelte';

  // ─── Formatting ────────────────────────────────────────────────────────────

  function formatFull(d: Date): string {
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    }) + ' at ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }

  function formatShort(d: Date): string {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function initials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function getAvatarColor(name: string): string {
    const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
    let hash = 0;
    for (const ch of name) hash = hash * 31 + ch.charCodeAt(0);
    return colors[Math.abs(hash) % colors.length];
  }

  // ─── Tab + view filter ────────────────────────────────────────────────────

  let activeTab = $state<'threads' | 'log' | 'client'>('threads');
  // viewMode derived from activeTab so existing logic still works
  let viewMode = $derived<'internal' | 'client'>(activeTab === 'client' ? 'client' : 'internal');
  let searchQuery = $state('');
  let filterStatus = $state<'all' | 'comment' | 'approval_pending' | 'approved' | 'changes_requested' | 'cancelled'>('all');
  let threadPendingMode = $state(false);
  let threadPendingTimer: ReturnType<typeof setTimeout> | null = null;

  function triggerThreadMode() {
    threadPendingMode = true;
    if (threadPendingTimer) clearTimeout(threadPendingTimer);
    threadPendingTimer = setTimeout(() => { threadPendingMode = false; }, 6000);
  }

  // ─── Date accordion + reply state ─────────────────────────────────────────

  let expandedDates = $state<Record<string, boolean>>({});
  let expandedReplies = $state<Record<string, boolean>>({});
  let replyInputs = $state<Record<string, string>>({});
  let replyExpanded = $state<Record<string, boolean>>({});

  // ─── Derived comment state ─────────────────────────────────────────────────

  let sessionComments = $derived(
    $comments3D.filter(c => c.sessionId === $activeSession?.id)
  );

  // Top-level non-cancelled comments filtered by viewMode, status, and spatial search
  let filteredComments = $derived(
    sessionComments
      .filter(c => !c.parentId)
      .filter(c => filterStatus === 'cancelled'
        ? c.status === 'cancelled'
        : c.status !== 'cancelled' && (filterStatus === 'all' ? true : c.status === filterStatus))
      .filter(c => viewMode === 'client' ? c.clientVisible : true)
      .filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        // Match only spatial asset labels — not comment conversation text
        return (c.objectName ?? '').toLowerCase().includes(q)
            || (c.objectType ?? '').toLowerCase().includes(q);
      })
  );

  // Group by calendar date → array of [dateKey, Comment3D[]] tuples
  let groupedByDate = $derived(
    filteredComments.reduce((acc, c) => {
      const key = c.timestamp.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });
      const existing = acc.find(([k]) => k === key);
      if (existing) existing[1].push(c);
      else acc.push([key, [c]]);
      return acc;
    }, [] as [string, Comment3D[]][])
  );

  // Cancelled top-level comments (internal view only)
  let cancelledComments = $derived(
    viewMode === 'internal'
      ? sessionComments.filter(c => !c.parentId && c.status === 'cancelled')
      : []
  );

  let activeCount = $derived(
    sessionComments.filter(c => !c.parentId && c.status !== 'cancelled').length
  );

  function getReplies(parentId: string): Comment3D[] {
    return sessionComments
      .filter(c => c.parentId === parentId)
      .filter(c => viewMode === 'client' ? c.clientVisible : true);
  }

  // ─── Permissions ───────────────────────────────────────────────────────────

  function canApprove(comment: Comment3D): boolean {
    if (comment.status !== 'approval_pending') return false;
    if (comment.commitAuthorId === $activeUserId) return false;
    const sessionIsInternal = $activeSession?.visibility === 'internal';
    const userIsClient = $activeUser.projectRole === 'Client';
    if (sessionIsInternal && userIsClient) return false;
    if ($hasProjectApprover) return $activeUser.projectRole === 'Project Approver';
    return true;
  }

  let canEdit = $derived($activeUser.permissionLevel === 'full');
  let isClient = $derived($activeUser.projectRole === 'Client');

  // ─── UI state ──────────────────────────────────────────────────────────────

  let selectedCommentId = $state<string | null>(null);
  let cancelledExpanded = $state(false);
  let renamingSessionId = $state<string | null>(null);
  let renameValue = $state('');
  let sessionDropdownOpen = $state(false);
  let createFormOpen = $state(false);
  let newSessionName = $state('');
  let newSessionVisibility = $state<SessionVisibility>('internal');
  let commitInputs = $state<Record<string, string>>({});
  let commitExpanded = $state<Record<string, boolean>>({});
  let emailConfirm = $state('');

  function selectComment(c: Comment3D) {
    selectedCommentId = selectedCommentId === c.id ? null : c.id;
    highlightedCommentObjectId.set(c.objectId);
    focusedCommentId.set(c.id);
  }

  function startRename(session: ReviewSession) {
    renamingSessionId = session.id;
    renameValue = session.name;
    sessionDropdownOpen = false;
  }

  function finishRename(sessionId: string) {
    if (renameValue.trim()) renameSession(sessionId, renameValue.trim());
    renamingSessionId = null;
  }

  function handleCommit(commentId: string) {
    const desc = (commitInputs[commentId] ?? '').trim();
    if (!desc) return;
    commitFix(commentId, desc);
    commitExpanded[commentId] = false;
    commitInputs[commentId] = '';
  }

  function handleCreateSession() {
    const name = newSessionName.trim();
    if (!name) return;
    createSession(name, newSessionVisibility);
    newSessionName = '';
    newSessionVisibility = 'internal';
    createFormOpen = false;
  }

  function handleReply(parentId: string) {
    const text = (replyInputs[parentId] ?? '').trim();
    if (!text) return;
    addReply(parentId, text);
    replyInputs[parentId] = '';
    replyExpanded[parentId] = false;
  }

  // ─── Gmail deep-link ───────────────────────────────────────────────────────

  function buildGmailLink(scopedComments?: Comment3D[]): string {
    const session = $activeSession;
    if (!session) return '';

    const projectName = $currentProject?.name ?? 'Untitled Project';
    const today = new Date().toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const typeLabel = session.visibility === 'internal' ? '🔒 Internal Only' : '👥 Client Facing';

    const recipients = $collabUsers
      .filter(u => {
        if (u.permissionLevel === 'none') return false;
        if (session.visibility === 'internal' && isClientRole(u.role)) return false;
        return true;
      })
      .map(u => u.email)
      .join(',');

    const subject = `[Review] ${session.name} — ${projectName}`;
    const divider = '═'.repeat(50);
    const rowDiv  = '─'.repeat(50);

    const lines: string[] = [
      divider,
      '  REVIEW SESSION SUMMARY',
      `  Session:  ${session.name}`,
      `  Project:  ${projectName}`,
      `  Type:     ${typeLabel}`,
      `  Date:     ${today}`,
      divider,
      '',
      '#    COMMENT                           AUTHOR      POSTED                STATUS',
      rowDiv,
    ];

    const source = scopedComments ?? sessionComments.filter(c => !c.parentId && c.status !== 'cancelled');
    if (source.length === 0) {
      lines.push('     No comments in this scope yet.');
    } else {
      source.forEach((c, i) => {
        const num    = String(i + 1).padEnd(4);
        const text   = `"${c.text.slice(0, 30)}${c.text.length > 30 ? '…' : ''}"`.padEnd(34);
        const author = c.authorName.padEnd(11);
        const posted = formatShort(c.timestamp).padEnd(21);
        let status = '';
        if (c.status === 'comment') status = '🔵 Open';
        else if (c.status === 'approval_pending') status = `⏳ Awaiting Approval (fix by ${c.commitAuthorName})`;
        else if (c.status === 'approved') status = `✅ Approved by ${c.resolvedBy} · ${c.resolvedAt ? formatShort(c.resolvedAt) : ''}`;
        else if (c.status === 'changes_requested') status = `🔄 Changes Requested by ${c.resolvedBy}`;
        lines.push(`${num} ${text} ${author} ${posted} ${status}`);
      });
    }

    lines.push(rowDiv);
    lines.push('');
    lines.push('Sent from open3dFloorPlan · Collaboration Mode');

    const to   = encodeURIComponent(recipients);
    const su   = encodeURIComponent(subject);
    const body = encodeURIComponent(lines.join('\n'));
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`;
  }

  function sendEmailSummary() {
    const url = buildGmailLink();
    if (!url) return;
    window.open(url, '_blank');
    emailConfirm = 'Gmail draft opened ✓';
    setTimeout(() => { emailConfirm = ''; }, 3000);
  }

  function sendDateEmail(dayComments: Comment3D[]) {
    const url = buildGmailLink(dayComments);
    if (!url) return;
    window.open(url, '_blank');
    emailConfirm = 'Gmail draft opened ✓';
    setTimeout(() => { emailConfirm = ''; }, 3000);
  }
</script>

<div class="w-80 shrink-0 bg-white border-l border-gray-200 flex flex-col h-full select-none">

  <!-- ── Tab bar ────────────────────────────────────────────────────────────── -->
  <div class="flex border-b border-gray-200 shrink-0">
    {#each ([
      { id: 'threads', label: '🧵 Threads' },
      { id: 'log',     label: '📋 Log' },
      { id: 'client',  label: '👥 Client View' },
    ] as const) as tab}
      {#if !(tab.id === 'client' && $activeUser.projectRole === 'Client')}
        <button
          class="flex-1 py-2 text-xs font-semibold transition-colors
            {activeTab === tab.id
              ? 'border-b-2 border-violet-600 text-violet-700 bg-violet-50'
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}"
          onclick={() => { activeTab = tab.id; }}
        >{tab.label}</button>
      {/if}
    {/each}
  </div>

  <!-- ── Search + Thread row ───────────────────────────────────────────────── -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
    <div class="relative flex-1">
      <span class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 text-xs pointer-events-none">🔍</span>
      <input
        class="w-full text-xs pl-6 pr-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-violet-300 placeholder-gray-300"
        placeholder="Search by asset name or type..."
        bind:value={searchQuery}
      />
    </div>
    <button
      onclick={triggerThreadMode}
      class="shrink-0 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-md transition-colors flex items-center gap-1"
    >
      <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
      </svg>
      Thread
    </button>
  </div>

  <!-- Thread pending banner -->
  {#if threadPendingMode}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="mx-3 mt-2 mb-0 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 shrink-0"
      onclick={() => { threadPendingMode = false; }}
    >
      <span class="text-amber-500 shrink-0">📌</span>
      <p class="text-[11px] text-amber-700 leading-tight flex-1">Click any object in the 3D viewport to attach a new thread.</p>
      <button class="text-amber-400 hover:text-amber-600 shrink-0">✕</button>
    </div>
  {/if}

  <!-- ── Status filter chips ──────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 shrink-0 overflow-x-auto">
    {#each ([
      { value: 'all',               label: 'All' },
      { value: 'comment',           label: '🔵 Open' },
      { value: 'approval_pending',  label: '⏳ Pending' },
      { value: 'approved',          label: '✅ Approved' },
      { value: 'changes_requested', label: '🔄 Changes' },
      { value: 'cancelled',         label: '❌ Cancelled' },
    ] as const) as chip}
      <button
        onclick={() => { filterStatus = chip.value; }}
        class="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap
          {filterStatus === chip.value
            ? 'bg-violet-600 text-white border-violet-600'
            : 'bg-white text-slate-500 border-gray-200 hover:border-violet-300 hover:text-violet-600'}"
      >{chip.label}</button>
    {/each}
  </div>

  <!-- ── Session bar ─────────────────────────────────────────────────────── -->
  <div class="px-3 py-2 border-b border-gray-100 bg-slate-50 shrink-0">
    <div class="flex items-center gap-1.5">

      <!-- Session selector dropdown trigger -->
      <div class="relative flex-1 min-w-0">
        {#if renamingSessionId === $activeSession?.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            autofocus
            class="w-full text-xs font-semibold text-slate-700 border border-violet-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-300"
            bind:value={renameValue}
            onblur={() => finishRename($activeSession!.id)}
            onkeydown={(e) => {
              if (e.key === 'Enter') finishRename($activeSession!.id);
              if (e.key === 'Escape') renamingSessionId = null;
            }}
          />
        {:else}
          <button
            class="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-200/60 transition-colors text-left"
            onclick={() => { sessionDropdownOpen = !sessionDropdownOpen; }}
          >
            <svg class="w-3.5 h-3.5 text-violet-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span class="text-xs font-semibold text-slate-700 truncate flex-1">
              {$activeSession?.name ?? 'No Session'}
            </span>
            {#if $activeSession}
              {#if $activeSession.visibility === 'internal'}
                <span class="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 font-medium">🔒 Internal</span>
              {:else}
                <span class="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">👥 Client</span>
              {/if}
            {/if}
            <svg class="w-3 h-3 text-slate-400 shrink-0 transition-transform {sessionDropdownOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        {/if}

        <!-- Dropdown list -->
        {#if sessionDropdownOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => { if (e.key === 'Escape') sessionDropdownOpen = false; }}
          >
            {#each $visibleSessions as session (session.id)}
              <div
                class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer transition-colors {$activeSession?.id === session.id ? 'bg-violet-50' : ''}"
                onclick={() => { setActiveSessionId(session.id); sessionDropdownOpen = false; }}
                role="option"
                aria-selected={$activeSession?.id === session.id}
                tabindex="0"
                onkeydown={(e) => { if (e.key === 'Enter') { setActiveSessionId(session.id); sessionDropdownOpen = false; } }}
              >
                <span class="flex-1 text-xs text-slate-700 font-medium truncate">{session.name}</span>
                <span class="text-[9px] px-1.5 py-0.5 rounded-full shrink-0 font-medium {session.visibility === 'internal' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-600'}">
                  {session.visibility === 'internal' ? '🔒 Internal' : '👥 Client'}
                </span>
                <button
                  onclick={(e) => { e.stopPropagation(); startRename(session); sessionDropdownOpen = false; }}
                  class="shrink-0 text-gray-300 hover:text-gray-500 transition-colors p-0.5"
                  title="Rename"
                >
                  <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
            {/each}
            {#if $visibleSessions.length === 0}
              <div class="px-3 py-3 text-xs text-slate-400 text-center">No sessions available</div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- [+] Create session (team only) -->
      {#if !isClient}
        <button
          onclick={() => { createFormOpen = !createFormOpen; sessionDropdownOpen = false; }}
          class="p-1.5 rounded-md text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors shrink-0"
          title="Create new session"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      {/if}

      <!-- [✉] Full-session Gmail -->
      <button
        onclick={sendEmailSummary}
        class="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
        title="Open Gmail draft with session summary"
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </button>
    </div>

    {#if emailConfirm}
      <p class="text-[11px] text-green-600 mt-1.5 font-medium pl-1">{emailConfirm}</p>
    {/if}
  </div>

  <!-- ── Create session form (inline) ─────────────────────────────────────── -->
  {#if createFormOpen}
    <div class="px-3 py-3 border-b border-violet-100 bg-violet-50/60 shrink-0">
      <p class="text-[10px] font-semibold text-violet-600 uppercase tracking-wide mb-2">New Session</p>
      <input
        class="w-full text-xs border border-violet-200 rounded-md px-2.5 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
        placeholder='e.g. "Client Review 27 May"'
        bind:value={newSessionName}
        onkeydown={(e) => { if (e.key === 'Enter') handleCreateSession(); if (e.key === 'Escape') { createFormOpen = false; } }}
      />
      <div class="flex gap-2 mb-2.5">
        <button
          onclick={() => { newSessionVisibility = 'internal'; }}
          class="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md border transition-all {newSessionVisibility === 'internal' ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-gray-200 bg-white text-slate-400 hover:border-slate-300'}"
        >🔒 Internal Only</button>
        <button
          onclick={() => { newSessionVisibility = 'client-facing'; }}
          class="flex-1 flex items-center justify-center gap-1 text-[11px] font-medium py-1.5 rounded-md border transition-all {newSessionVisibility === 'client-facing' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-slate-400 hover:border-blue-200'}"
        >👥 Client Facing</button>
      </div>
      <div class="flex gap-2">
        <button
          onclick={handleCreateSession}
          disabled={!newSessionName.trim()}
          class="flex-1 text-xs font-semibold py-1.5 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >Create Session</button>
        <button
          onclick={() => { createFormOpen = false; newSessionName = ''; }}
          class="text-xs px-3 py-1.5 rounded-md border-2 border-gray-300 bg-white text-gray-600 font-medium hover:bg-gray-100 hover:border-gray-400 shadow-sm transition-colors"
        >Cancel</button>
      </div>
    </div>
  {/if}

  <!-- ── Active user info ──────────────────────────────────────────────────── -->
  <div class="px-4 py-2 bg-slate-50 border-b border-gray-100 flex items-center gap-2 shrink-0">
    <div
      class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
      style="background-color: {getAvatarColor($activeUser.name)}"
    >{initials($activeUser.name)}</div>
    <div>
      <span class="text-xs font-medium text-slate-600">{$activeUser.name}</span>
      <span class="text-[10px] text-slate-400 ml-1">({$activeUser.role})</span>
    </div>
    <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium
      {$activeUser.permissionLevel === 'full' ? 'bg-green-100 text-green-700' :
       $activeUser.permissionLevel === 'viewer' ? 'bg-amber-100 text-amber-700' :
       'bg-red-100 text-red-600'}">
      {$activeUser.permissionLevel === 'full' ? 'Editor' :
       $activeUser.permissionLevel === 'viewer' ? 'Viewer' : 'No Access'}
    </span>
  </div>

  <!-- ── Log tab ──────────────────────────────────────────────────────────── -->
  {#if activeTab === 'log'}
    <LogTable
      comments={sessionComments}
      users={$collabUsers}
      sessionVisibility={$activeSession?.visibility ?? 'internal'}
      {filterStatus}
      onSelectComment={(c) => {
        selectedCommentId = c.id;
        highlightedCommentObjectId.set(c.objectId);
        focusedCommentId.set(c.id);
        activeTab = 'threads';
      }}
    />
  {/if}

  <!-- ── Comment timeline ──────────────────────────────────────────────────── -->
  {#if activeTab === 'threads' || activeTab === 'client'}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="flex-1 overflow-y-auto" onclick={() => { if (sessionDropdownOpen) sessionDropdownOpen = false; }}>

    {#if !$activeSession}
      <div class="flex flex-col items-center justify-center h-40 text-center px-6">
        <p class="text-sm text-slate-400">No session selected</p>
        {#if !isClient}
          <p class="text-xs text-slate-300 mt-1">Click <strong>[+]</strong> to create your first session</p>
        {/if}
      </div>

    {:else if groupedByDate.length === 0}
      <div class="flex flex-col items-center justify-center h-40 text-center px-6">
        <svg class="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p class="text-sm text-slate-400">
          {searchQuery ? 'No matching items' : (viewMode === 'client' ? 'No client-visible comments' : 'No comments yet')}
        </p>
        {#if !searchQuery && viewMode === 'internal'}
          <p class="text-xs text-slate-300 mt-1">Click any object in the 3D view to comment</p>
        {/if}
      </div>

    {:else}
      <!-- Date-grouped accordions -->
      {#each groupedByDate as [dateKey, dayComments] (dateKey)}
        <div class="border-b border-gray-100">
          <!-- Date accordion header -->
          <div class="flex items-center gap-2 px-3 py-2 bg-gray-50 sticky top-0 z-10">
            <button
              class="flex-1 flex items-center gap-1.5 text-left"
              onclick={() => { expandedDates[dateKey] = !(expandedDates[dateKey] ?? true); }}
            >
              <svg
                class="w-3 h-3 text-slate-400 transition-transform shrink-0 {(expandedDates[dateKey] ?? true) ? '' : '-rotate-90'}"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
              <span class="text-xs font-semibold text-slate-600">{dateKey}</span>
              <span class="text-[10px] bg-gray-200 text-gray-500 rounded-full px-1.5 py-0.5 font-medium">{dayComments.length}</span>
            </button>
            <!-- Per-date Gmail button -->
            <button
              onclick={() => sendDateEmail(dayComments)}
              class="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors shrink-0"
              title="Email summary for {dateKey}"
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          <!-- Comments for this date -->
          {#if expandedDates[dateKey] ?? true}
            <div class="divide-y divide-gray-50">
              {#each dayComments as comment (comment.id)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 {selectedCommentId === comment.id ? 'bg-violet-50 border-l-2 border-violet-500' : 'border-l-2 border-transparent'}"
                  onclick={() => selectComment(comment)}
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectComment(comment); } }}
                  role="button"
                  tabindex="0"
                  aria-label="Comment by {comment.authorName}"
                >
                  <!-- Comment header row -->
                  <div class="flex items-start gap-2.5">
                    <div
                      class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5"
                      style="background-color: {getAvatarColor(comment.authorName)}"
                    >{initials(comment.authorName)}</div>

                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline justify-between gap-1">
                        <span class="text-xs font-semibold text-slate-700">{comment.authorName}</span>
                        <div class="flex items-center gap-1 shrink-0">
                          <!-- 👁 client visibility toggle (internal view only) -->
                          {#if viewMode === 'internal'}
                            <button
                              onclick={(e) => { e.stopPropagation(); toggleClientVisible(comment.id); }}
                              class="text-[11px] p-0.5 rounded transition-colors leading-none {comment.clientVisible ? 'text-blue-500 hover:text-blue-700' : 'text-gray-300 hover:text-gray-500'}"
                              title="{comment.clientVisible ? 'Visible to client — click to hide' : 'Hidden from client — click to show'}"
                            >👁</button>
                          {/if}
                          <span class="text-[10px] text-slate-400">{formatFull(comment.timestamp)}</span>
                          {#if comment.status === 'comment' || comment.status === 'approval_pending'}
                            {@const elapsed = timeElapsed(comment.timestamp)}
                            <span class="text-[10px] font-medium ml-1
                              {elapsed.urgency === 'high'   ? 'text-red-500'    :
                               elapsed.urgency === 'medium' ? 'text-amber-500'  :
                                                              'text-gray-400'}">
                              · {elapsed.label}
                            </span>
                          {/if}
                        </div>
                      </div>

                      {#if comment.objectId}
                        <div class="flex items-center gap-1 mt-0.5">
                          <span class="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded font-medium truncate max-w-[140px]">
                            📦 {comment.objectName ?? comment.objectId.slice(0, 8)}…
                          </span>
                          {#if comment.objectType && comment.objectType !== 'Object'}
                            <span class="text-[9px] text-slate-300">{comment.objectType}</span>
                          {/if}
                        </div>
                      {:else}
                        <div class="text-[10px] text-slate-300 mt-0.5">General comment</div>
                      {/if}

                      <p class="text-xs text-slate-600 mt-1 leading-relaxed break-words">{comment.text}</p>
                    </div>
                  </div>

                  <!-- ── STATE: comment ── -->
                  {#if comment.status === 'comment'}
                    <div class="mt-2 ml-9 flex items-center gap-2 flex-wrap">
                      {#if canEdit || comment.authorId === $activeUserId}
                        <button
                          onclick={(e) => { e.stopPropagation(); cancelComment(comment.id); }}
                          class="text-[10px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-50"
                        >
                          <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Cancel
                        </button>
                      {/if}

                      {#if canEdit}
                        {#if commitExpanded[comment.id]}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <div class="flex gap-1.5 mt-1 w-full" onclick={(e) => e.stopPropagation()}>
                            <input
                              class="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-300"
                              placeholder="Describe the fix…"
                              bind:value={commitInputs[comment.id]}
                              onkeydown={(e) => { if (e.key === 'Enter') handleCommit(comment.id); }}
                            />
                            <button
                              onclick={(e) => { e.stopPropagation(); handleCommit(comment.id); }}
                              class="text-[10px] px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors font-medium"
                            >Submit</button>
                            <button
                              onclick={(e) => { e.stopPropagation(); commitExpanded[comment.id] = false; }}
                              class="text-[10px] px-2 py-1 text-gray-400 hover:text-gray-600 transition-colors"
                            >✕</button>
                          </div>
                        {:else}
                          <button
                            onclick={(e) => { e.stopPropagation(); commitExpanded[comment.id] = true; }}
                            class="text-[10px] text-violet-500 hover:text-violet-700 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-violet-50"
                          >
                            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Commit Fix
                          </button>
                        {/if}
                      {/if}
                    </div>

                  <!-- ── STATE: approval_pending ── -->
                  {:else if comment.status === 'approval_pending'}
                    <div class="mt-2 ml-9 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                      <div class="flex items-start gap-1.5 mb-2">
                        <svg class="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p class="text-[10px] font-semibold text-green-700">Fix committed by {comment.commitAuthorName}</p>
                          <p class="text-[11px] text-green-800 mt-0.5 italic">"{comment.commitDescription}"</p>
                        </div>
                      </div>

                      {#if canApprove(comment)}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <div class="flex gap-2" onclick={(e) => e.stopPropagation()}>
                          <button
                            onclick={() => resolveComment(comment.id, 'approved')}
                            class="flex-1 text-[11px] font-semibold px-2 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                          >
                            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                            </svg>
                            Approve ✅
                          </button>
                          <button
                            onclick={() => resolveComment(comment.id, 'changes_requested')}
                            class="flex-1 text-[11px] font-semibold px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors flex items-center justify-center gap-1"
                          >
                            <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            Request Changes ❌
                          </button>
                        </div>
                      {:else if comment.commitAuthorId === $activeUserId}
                        <p class="text-[10px] text-green-600 italic">Awaiting review from team…</p>
                      {:else}
                        <p class="text-[10px] text-slate-400 italic">Approval is handled by the design team.</p>
                      {/if}
                    </div>

                  <!-- ── STATE: approved ── -->
                  {:else if comment.status === 'approved'}
                    <div class="mt-2 ml-9 flex items-center gap-1.5 text-[11px] text-green-700 font-medium bg-green-50 rounded-lg px-2.5 py-1.5">
                      <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                      Approved by {comment.resolvedBy}
                      <span class="text-green-500 font-normal ml-1">{comment.resolvedAt ? formatFull(comment.resolvedAt) : ''}</span>
                    </div>

                  <!-- ── STATE: changes_requested ── -->
                  {:else if comment.status === 'changes_requested'}
                    <div class="mt-2 ml-9">
                      <div class="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium bg-amber-50 rounded-lg px-2.5 py-1.5 mb-1.5">
                        <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                        Changes requested by {comment.resolvedBy}
                      </div>
                      {#if canEdit}
                        {#if commitExpanded[comment.id]}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <div class="flex gap-1.5" onclick={(e) => e.stopPropagation()}>
                            <input
                              class="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-300"
                              placeholder="Describe the new fix…"
                              bind:value={commitInputs[comment.id]}
                              onkeydown={(e) => { if (e.key === 'Enter') handleCommit(comment.id); }}
                            />
                            <button
                              onclick={(e) => { e.stopPropagation(); handleCommit(comment.id); }}
                              class="text-[10px] px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors font-medium"
                            >Submit</button>
                          </div>
                        {:else}
                          <button
                            onclick={(e) => { e.stopPropagation(); commitExpanded[comment.id] = true; }}
                            class="text-[10px] text-violet-500 hover:text-violet-700 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-violet-50"
                          >
                            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Re-Commit Fix
                          </button>
                        {/if}
                      {/if}
                    </div>
                  {/if}

                  <!-- ── Nested replies ── -->
                  {#if true}
                    {@const replies = getReplies(comment.id)}
                    {#if replies.length > 0 || replyExpanded[comment.id]}
                      <div class="ml-9 mt-2 border-l-2 border-gray-100 pl-2.5">
                        <!-- Collapse older replies if more than 2 -->
                        {#if replies.length > 2 && !expandedReplies[comment.id]}
                          <button
                            onclick={(e) => { e.stopPropagation(); expandedReplies[comment.id] = true; }}
                            class="text-[10px] text-slate-400 hover:text-slate-600 py-0.5 px-1 mb-1 transition-colors"
                          >↑ See {replies.length - 2} previous comment{replies.length - 2 !== 1 ? 's' : ''}</button>
                        {/if}

                        {#each (expandedReplies[comment.id] ? replies : replies.slice(-2)) as reply (reply.id)}
                          <div class="py-1.5 flex items-start gap-2">
                            <div
                              class="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0 mt-0.5"
                              style="background-color: {getAvatarColor(reply.authorName)}"
                            >{initials(reply.authorName)}</div>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-baseline gap-1 flex-wrap">
                                <span class="text-[10px] font-semibold text-slate-700">{reply.authorName}</span>
                                <span class="text-[9px] text-slate-400">{formatFull(reply.timestamp)}</span>
                                {#if viewMode === 'internal'}
                                  <button
                                    onclick={(e) => { e.stopPropagation(); toggleClientVisible(reply.id); }}
                                    class="text-[10px] p-0.5 rounded leading-none transition-colors {reply.clientVisible ? 'text-blue-500 hover:text-blue-700' : 'text-gray-300 hover:text-gray-500'}"
                                    title="{reply.clientVisible ? 'Visible to client' : 'Hidden from client'}"
                                  >👁</button>
                                {/if}
                              </div>
                              <p class="text-[11px] text-slate-600 mt-0.5 break-words">{reply.text}</p>
                            </div>
                          </div>
                        {/each}

                        <!-- Reply input (team editors only) -->
                        {#if canEdit}
                          {#if replyExpanded[comment.id]}
                            <!-- svelte-ignore a11y_no_static_element_interactions -->
                            <div class="flex gap-1.5 mt-1 pb-1" onclick={(e) => e.stopPropagation()}>
                              <input
                                class="flex-1 text-[10px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-300"
                                placeholder="Reply…"
                                bind:value={replyInputs[comment.id]}
                                onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleReply(comment.id); if (e.key === 'Escape') { replyExpanded[comment.id] = false; } }}
                              />
                              <button
                                onclick={(e) => { e.stopPropagation(); handleReply(comment.id); }}
                                class="text-[10px] px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors font-medium shrink-0"
                              >Send</button>
                            </div>
                          {:else}
                            <button
                              onclick={(e) => { e.stopPropagation(); replyExpanded[comment.id] = true; }}
                              class="text-[10px] text-slate-400 hover:text-violet-500 transition-colors py-0.5 px-1 mt-0.5"
                            >↩ Reply</button>
                          {/if}
                        {/if}
                      </div>
                    {:else if canEdit}
                      <!-- No replies yet — show reply starter -->
                      <div class="ml-9 mt-1">
                        {#if replyExpanded[comment.id]}
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <div class="flex gap-1.5" onclick={(e) => e.stopPropagation()}>
                            <input
                              class="flex-1 text-[10px] border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-300"
                              placeholder="Reply…"
                              bind:value={replyInputs[comment.id]}
                              onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleReply(comment.id); if (e.key === 'Escape') { replyExpanded[comment.id] = false; } }}
                            />
                            <button
                              onclick={(e) => { e.stopPropagation(); handleReply(comment.id); }}
                              class="text-[10px] px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700 transition-colors font-medium shrink-0"
                            >Send</button>
                          </div>
                        {:else}
                          <button
                            onclick={(e) => { e.stopPropagation(); replyExpanded[comment.id] = true; }}
                            class="text-[10px] text-slate-400 hover:text-violet-500 transition-colors py-0.5"
                          >↩ Reply</button>
                        {/if}
                      </div>
                    {/if}
                  {/if}

                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}

    <!-- ── Cancelled accordion ──────────────────────────────────────────────── -->
    {#if cancelledComments.length > 0 && filterStatus !== 'cancelled'}
      <div class="border-t border-gray-100 mt-1">
        <button
          class="w-full flex items-center justify-between px-4 py-2.5 text-[11px] text-slate-400 hover:bg-gray-50 transition-colors"
          onclick={() => { cancelledExpanded = !cancelledExpanded; }}
        >
          <span class="flex items-center gap-1.5">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8m-9 4v4m4-4v4" />
            </svg>
            {cancelledComments.length} cancelled item{cancelledComments.length !== 1 ? 's' : ''}
          </span>
          <svg
            class="w-3 h-3 transition-transform {cancelledExpanded ? 'rotate-180' : ''}"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {#if cancelledExpanded}
          <div class="divide-y divide-gray-50 bg-gray-50/50">
            {#each cancelledComments as comment (comment.id)}
              <div class="px-4 py-3 opacity-50">
                <div class="flex items-start gap-2.5">
                  <div
                    class="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5"
                    style="background-color: {getAvatarColor(comment.authorName)}"
                  >{initials(comment.authorName)}</div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline justify-between gap-1">
                      <span class="text-[11px] font-semibold text-slate-600">{comment.authorName}</span>
                      <span class="text-[10px] text-slate-400 shrink-0">{formatFull(comment.timestamp)}</span>
                    </div>
                    <p class="text-[11px] text-slate-500 mt-0.5 break-words line-through">{comment.text}</p>
                    <p class="text-[10px] text-slate-400 mt-1">
                      Cancelled by <span class="font-medium">{comment.cancelledBy}</span>
                      {comment.cancelledAt ? ' · ' + formatFull(comment.cancelledAt) : ''}
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {/if}

  <!-- Footer hint -->
  <div class="px-4 py-2.5 border-t border-gray-100 bg-slate-50 shrink-0">
    <p class="text-[11px] text-slate-400 leading-snug">
      Click an object in the 3D view to attach a comment. Click a comment to focus it in the viewport.
    </p>
  </div>
</div>
