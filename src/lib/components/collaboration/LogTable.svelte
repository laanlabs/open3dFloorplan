<script lang="ts">
  import type { Comment3D, CollabUser } from '$lib/stores/collaboration';
  import { groupByObject, getLogNumber, resolveActionText, type ObjectGroup } from '$lib/utils/collabLog';
  import { timeElapsed } from '$lib/utils/timeElapsed';

  let { comments, users, sessionVisibility, filterStatus, onSelectComment } = $props<{
    comments: Comment3D[];
    users: CollabUser[];
    sessionVisibility: 'internal' | 'client-facing';
    filterStatus: string;
    onSelectComment: (c: Comment3D) => void;
  }>();

  // ─── Sorting ────────────────────────────────────────────────────────────────

  let sortCol = $state<'status' | 'open' | null>('open');
  let sortDir = $state<'asc' | 'desc'>('desc'); // most urgent first

  function toggleSort(col: 'status' | 'open') {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = col === 'open' ? 'desc' : 'asc';
    }
  }

  // ─── Status ordering for sort ───────────────────────────────────────────────

  const STATUS_ORDER: Record<string, number> = {
    comment: 0,
    approval_pending: 1,
    changes_requested: 2,
    cancelled: 3,
    approved: 4,
  };

  // ─── Derived groups ──────────────────────────────────────────────────────────

  // Include cancelled in Log (unlike Threads which hides them by default)
  let allTopLevel = $derived(comments.filter(c => !c.parentId));

  let groups = $derived(groupByObject(allTopLevel)); // group from ALL (for history context)

  // Build rows: one row per group (latest comment), filtered by filterStatus
  let rows = $derived.by(() => {
    const built = groups
      .map((g, gi) => ({
        group: g,
        groupIndex: gi,
        latest: g.comments[g.comments.length - 1],
      }))
      .filter(r => filterStatus === 'all' ? true : r.latest.status === filterStatus);

    if (sortCol === 'open') {
      built.sort((a, b) => {
        const aMs = Date.now() - a.latest.timestamp.getTime();
        const bMs = Date.now() - b.latest.timestamp.getTime();
        return sortDir === 'desc' ? bMs - aMs : aMs - bMs;
      });
    } else if (sortCol === 'status') {
      built.sort((a, b) => {
        const diff = STATUS_ORDER[a.latest.status] - STATUS_ORDER[b.latest.status];
        return sortDir === 'asc' ? diff : -diff;
      });
    }
    return built;
  });

  // ─── History expand state ────────────────────────────────────────────────────

  let expandedGroups = $state<Record<string, boolean>>({});

  function toggleHistory(objectKey: string) {
    expandedGroups[objectKey] = !expandedGroups[objectKey];
  }

  function groupKey(g: ObjectGroup): string {
    return g.objectId ?? `__null__${g.comments[0]?.id}`;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function statusBadge(status: Comment3D['status']): string {
    const map: Record<string, string> = {
      comment: '🔵 Open',
      approval_pending: '⏳ Pending',
      approved: '✅ Approved',
      changes_requested: '🔄 Changes Req',
      cancelled: '❌ Cancelled',
    };
    return map[status] ?? status;
  }

  function urgencyClass(urgency: 'low' | 'medium' | 'high'): string {
    if (urgency === 'high') return 'text-red-500 font-semibold';
    if (urgency === 'medium') return 'text-amber-500 font-medium';
    return 'text-gray-400';
  }

  function sortIcon(col: 'status' | 'open'): string {
    if (sortCol !== col) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  }
</script>

<div class="flex-1 overflow-auto">
  {#if rows.length === 0}
    <div class="flex items-center justify-center h-40 text-xs text-slate-400">
      No items match the current filter
    </div>
  {:else}
    <table class="w-full text-[11px] border-collapse">
      <thead class="sticky top-0 bg-slate-50 border-b border-gray-200 z-10">
        <tr>
          <th class="text-left px-2 py-2 font-semibold text-slate-500 w-10">#</th>
          <th class="text-left px-2 py-2 font-semibold text-slate-500 w-24">Object</th>
          <th class="text-left px-2 py-2 font-semibold text-slate-500">Comment</th>
          <th class="text-left px-2 py-2 font-semibold text-slate-500 w-20">Author</th>
          <th
            class="text-left px-2 py-2 font-semibold text-slate-500 w-24 cursor-pointer select-none hover:text-violet-600"
            onclick={() => toggleSort('status')}
          >Status {sortIcon('status')}</th>
          <th class="text-left px-2 py-2 font-semibold text-slate-500 w-32">Action</th>
          <th
            class="text-left px-2 py-2 font-semibold text-slate-500 w-14 cursor-pointer select-none hover:text-violet-600"
            onclick={() => toggleSort('open')}
          >Open {sortIcon('open')}</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as { group, groupIndex, latest }, rowI (groupKey(group))}
          {@const hasHistory = group.comments.length > 1}
          {@const isExpanded = expandedGroups[groupKey(group)] ?? false}
          {@const elapsed = timeElapsed(latest.timestamp)}
          {@const logNum = getLogNumber(groupIndex, group.comments.length - 1, group.comments.length)}

          <!-- ── Active row ── -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <tr
            class="border-b border-gray-100 hover:bg-violet-50 cursor-pointer transition-colors"
            onclick={() => onSelectComment(latest)}
            onkeydown={(e) => { if (e.key === 'Enter') onSelectComment(latest); }}
          >
            <!-- # cell with optional chevron -->
            <td class="px-2 py-2 font-mono text-[10px] text-slate-600 whitespace-nowrap">
              {#if hasHistory}
                <button
                  class="mr-0.5 text-slate-400 hover:text-violet-600 transition-colors"
                  onclick={(e) => { e.stopPropagation(); toggleHistory(groupKey(group)); }}
                  aria-label="Toggle history"
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              {/if}
              <span class="font-semibold text-violet-700">{logNum}</span>
            </td>

            <!-- Object -->
            <td class="px-2 py-2 text-slate-600 truncate max-w-[96px]">
              {#if latest.objectId}
                <span class="inline-flex items-center gap-0.5">
                  <span class="text-blue-400">📦</span>
                  <span class="truncate">{(latest.objectName ?? latest.objectId).slice(0, 18)}</span>
                </span>
              {:else}
                <span class="text-slate-400 italic">General</span>
              {/if}
            </td>

            <!-- Comment (truncated + title tooltip) -->
            <td class="px-2 py-2 text-slate-700 max-w-[160px]">
              <span title={latest.text} class="block truncate">
                {latest.text.length > 40 ? latest.text.slice(0, 40) + '…' : latest.text}
              </span>
            </td>

            <!-- Author -->
            <td class="px-2 py-2 text-slate-500 truncate max-w-[80px]">{latest.authorName}</td>

            <!-- Status badge -->
            <td class="px-2 py-2 whitespace-nowrap">{statusBadge(latest.status)}</td>

            <!-- Action -->
            <td class="px-2 py-2 text-slate-500 truncate max-w-[128px]">
              {resolveActionText(latest, users, sessionVisibility)}
            </td>

            <!-- Open (time elapsed) -->
            <td class="px-2 py-2 whitespace-nowrap {urgencyClass(elapsed.urgency)}">
              {elapsed.label}
            </td>
          </tr>

          <!-- ── History rows (expanded) ── -->
          {#if hasHistory && isExpanded}
            {#each group.comments.slice(0, -1) as histComment, hi}
              {@const histElapsed = timeElapsed(histComment.timestamp)}
              {@const histNum = getLogNumber(groupIndex, hi, group.comments.length)}
              <tr class="border-b border-gray-50 bg-gray-50">
                <td class="pl-6 pr-2 py-1.5 font-mono text-[10px] text-gray-400">{histNum}</td>
                <td class="px-2 py-1.5 text-gray-400 truncate max-w-[96px]">
                  {#if histComment.objectId}
                    <span class="truncate">{(histComment.objectName ?? '').slice(0, 18)}</span>
                  {:else}
                    <span class="italic">General</span>
                  {/if}
                </td>
                <td class="px-2 py-1.5 text-gray-400 max-w-[160px]">
                  <span class="block truncate">
                    {histComment.text.length > 40 ? histComment.text.slice(0, 40) + '…' : histComment.text}
                  </span>
                </td>
                <td class="px-2 py-1.5 text-gray-400 truncate">{histComment.authorName}</td>
                <td class="px-2 py-1.5 text-gray-400 whitespace-nowrap">{statusBadge(histComment.status)}</td>
                <td class="px-2 py-1.5 text-gray-400 truncate">
                  {resolveActionText(histComment, users, sessionVisibility)}
                </td>
                <td class="px-2 py-1.5 text-gray-400 whitespace-nowrap">{histElapsed.label}</td>
              </tr>
            {/each}
          {/if}
        {/each}
      </tbody>
    </table>
  {/if}
</div>
