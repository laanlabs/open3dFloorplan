<script lang="ts">
  import { collabUsers, activeUser, activeUserId, setActiveUserId, updateUserPermission } from '$lib/stores/collaboration';
  import type { PermissionLevel, CollabUser } from '$lib/stores/collaboration';

  let { onClose }: { onClose: () => void } = $props();

  const PERMISSION_OPTIONS: { value: PermissionLevel; label: string; desc: string }[] = [
    { value: 'full',   label: 'Full Access / Approval', desc: 'Can edit, move, delete, and approve changes' },
    { value: 'viewer', label: 'Viewer & Comment Only',  desc: 'Can view and leave comments, no edits' },
    { value: 'none',   label: 'No Access',              desc: 'Cannot view or interact with this project' },
  ];

  function initials(name: string) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function permLabel(level: PermissionLevel): string {
    return PERMISSION_OPTIONS.find(o => o.value === level)?.label ?? level;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] backdrop-blur-sm"
  onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
  onkeydown={handleKeydown}
  role="dialog"
  aria-modal="true"
  aria-label="Share & Access Control"
  tabindex="-1"
>
  <!-- Panel -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      <div class="flex items-center gap-2.5">
        <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <h2 class="text-base font-semibold text-slate-800">Share & Access Control</h2>
      </div>
      <button
        onclick={onClose}
        class="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
        aria-label="Close"
      >
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Active user switcher (demo) -->
    <div class="px-6 py-3 bg-slate-50 border-b border-gray-100 flex items-center gap-3">
      <span class="text-xs text-slate-500 font-medium shrink-0">Active as:</span>
      <div class="flex gap-2 flex-wrap">
        {#each $collabUsers as user}
          <button
            onclick={() => setActiveUserId(user.id)}
            class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all {$activeUserId === user.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}"
            title="Switch active user (demo only)"
          >
            <span
              class="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
              style="background-color: {user.avatarColor}"
            >{initials(user.name)}</span>
            {user.name}
          </button>
        {/each}
      </div>
    </div>

    <!-- User permission table -->
    <div class="divide-y divide-gray-100 max-h-72 overflow-y-auto">
      {#each $collabUsers as user}
        <div class="flex items-center gap-3 px-6 py-3.5 hover:bg-gray-50 transition-colors">
          <!-- Avatar -->
          <div
            class="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
            style="background-color: {user.avatarColor}"
          >{initials(user.name)}</div>
          <!-- Name / email / role -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-slate-800">{user.name}</span>
              {#if user.id === $activeUserId}
                <span class="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full font-medium">You</span>
              {/if}
            </div>
            <div class="text-xs text-slate-400 truncate">{user.email}</div>
            <div class="text-[11px] text-slate-400 mt-0.5">{user.role}</div>
          </div>
          <!-- Permission dropdown -->
          <div class="shrink-0">
            <select
              value={user.permissionLevel}
              onchange={(e) => updateUserPermission(user.id, (e.target as HTMLSelectElement).value as PermissionLevel)}
              class="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer"
            >
              {#each PERMISSION_OPTIONS as opt}
                <option value={opt.value}>{opt.label}</option>
              {/each}
            </select>
          </div>
        </div>
      {/each}
    </div>

    <!-- Permission legend -->
    <div class="px-6 py-3 bg-gray-50 border-t border-gray-100">
      <p class="text-[11px] text-slate-400 leading-relaxed">
        <span class="font-semibold text-slate-500">Full Access / Approval</span> — edit &amp; approve &nbsp;·&nbsp;
        <span class="font-semibold text-slate-500">Viewer &amp; Comment Only</span> — read-only with comments &nbsp;·&nbsp;
        <span class="font-semibold text-slate-500">No Access</span> — excluded from project
      </p>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between px-6 py-4 border-t border-gray-100">
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <path stroke-linecap="round" stroke-width="2" d="M12 8v4l3 3"/>
        </svg>
        Changes apply immediately
      </div>
      <button
        onclick={onClose}
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >Done</button>
    </div>
  </div>
</div>
