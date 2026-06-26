<script lang="ts">
  import { comments3D, highlightedCommentObjectId, deleteComment, activeUser } from '$lib/stores/collaboration';
  import type { Comment3D } from '$lib/stores/collaboration';

  function formatTime(d: Date): string {
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
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

  function onClickComment(c: Comment3D) {
    highlightedCommentObjectId.set(c.objectId);
  }

  function onDeleteComment(e: MouseEvent, id: string) {
    e.stopPropagation();
    deleteComment(id);
    if ($highlightedCommentObjectId) highlightedCommentObjectId.set(null);
  }

  let selectedCommentId = $state<string | null>(null);

  function selectComment(c: Comment3D) {
    selectedCommentId = selectedCommentId === c.id ? null : c.id;
    onClickComment(c);
  }
</script>

<div class="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col h-full select-none">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <span class="text-sm font-semibold text-slate-700">Comments</span>
      {#if $comments3D.length > 0}
        <span class="text-[11px] bg-violet-100 text-violet-600 rounded-full px-1.5 py-0.5 font-medium">{$comments3D.length}</span>
      {/if}
    </div>
    <!-- Email notification toggle (placeholder) -->
    <button
      class="p-1.5 rounded-lg text-gray-300 cursor-not-allowed"
      disabled
      title="Email notifications — coming soon"
    >
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    </button>
  </div>

  <!-- Active user info -->
  <div class="px-4 py-2 bg-slate-50 border-b border-gray-100 flex items-center gap-2">
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

  <!-- Comment list -->
  <div class="flex-1 overflow-y-auto">
    {#if $comments3D.length === 0}
      <div class="flex flex-col items-center justify-center h-40 text-center px-6">
        <svg class="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p class="text-sm text-slate-400">No comments yet</p>
        <p class="text-xs text-slate-300 mt-1">Click any object in the 3D view to comment</p>
      </div>
    {:else}
      <div class="divide-y divide-gray-50">
        {#each $comments3D as comment (comment.id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50 {selectedCommentId === comment.id ? 'bg-violet-50 border-l-2 border-violet-500' : ''}"
            onclick={() => selectComment(comment)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectComment(comment); } }}
            role="button"
            tabindex="0"
            aria-label="Comment by {comment.authorName}"
          >
            <div class="flex items-start gap-2.5">
              <!-- Avatar -->
              <div
                class="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5"
                style="background-color: {getAvatarColor(comment.authorName)}"
              >{initials(comment.authorName)}</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline justify-between gap-1">
                  <span class="text-xs font-semibold text-slate-700">{comment.authorName}</span>
                  <span class="text-[10px] text-slate-400 shrink-0">{formatTime(comment.timestamp)}</span>
                </div>
                {#if comment.objectId}
                  <div class="flex items-center gap-1 mt-0.5">
                    <span class="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded font-medium truncate max-w-[120px]">
                      📦 {comment.objectId.slice(0, 8)}…
                    </span>
                  </div>
                {:else}
                  <div class="text-[10px] text-slate-300 mt-0.5">General comment</div>
                {/if}
                <p class="text-xs text-slate-600 mt-1 leading-relaxed break-words">{comment.text}</p>
              </div>
              <!-- Delete (only own comments or full access) -->
              {#if $activeUser.permissionLevel === 'full' || comment.authorId === $activeUser.id}
                <button
                  onclick={(e) => onDeleteComment(e, comment.id)}
                  class="shrink-0 text-gray-300 hover:text-red-400 transition-colors p-0.5 opacity-0 group-hover:opacity-100 mt-0.5"
                  aria-label="Delete comment"
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer hint -->
  <div class="px-4 py-2.5 border-t border-gray-100 bg-slate-50">
    <p class="text-[11px] text-slate-400 leading-snug">
      Click an object in the 3D view to attach a comment to it. Click a comment to highlight its object.
    </p>
  </div>
</div>
