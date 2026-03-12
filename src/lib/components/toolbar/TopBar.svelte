<script lang="ts">
  import { selectedTool, viewMode, currentProject, saveProject, undo, redo, canUndo, canRedo, gridEnabled, snapEnabled, showDimensions, measurementUnit, currentFloorIndex, addFloor, duplicateFloor, deleteFloor } from '$lib/stores/project';
  import { base } from '$app/paths';
  import { exportAsPNG, exportAsJSON, exportAsSVG, exportPDF } from '$lib/utils/export';
  import { exportDXF } from '$lib/utils/cadExport';
  import { get } from 'svelte/store';
  import ExportModal from '../ExportModal.svelte';
  import ImportModal from '../ImportModal.svelte';
  import SettingsModal from '../SettingsModal.svelte';
  import HelpModal from '../HelpModal.svelte';
  import CommandPalette from '../editor/CommandPalette.svelte';

  interface Props {
    canvas?: HTMLCanvasElement | null;
    onSaveStateCallback?: () => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onZoomReset?: () => void;
    onZoomFit?: () => void;
    currentZoom?: number;
  }

  let {
    canvas = null,
    onSaveStateCallback,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onZoomFit,
    currentZoom = 1
  }: Props = $props();

  let showExport = $state(false);
  let showImport = $state(false);
  let showSettings = $state(false);
  let showHelp = $state(false);
  let showCommandPalette = $state(false);
  let showFileMenu = $state(false);
  let showEditMenu = $state(false);
  let showViewMenu = $state(false);
  let showFloorMenu = $state(false);

  // Subscribe to project for floor info
  let project = $derived($currentProject);
  let floorIndex = $derived($currentFloorIndex);
  let floors = $derived(project?.floors ?? []);
  let currentFloor = $derived(floors[floorIndex]);

  // Listen for settings event
  if (typeof window !== 'undefined') {
    window.addEventListener('open-settings', () => {
      showSettings = true;
    });
  }

  // Keyboard shortcuts
  function handleKeydown(e: KeyboardEvent) {
    // Ignore if in input
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

    // Cmd/Ctrl + K: Command Palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      showCommandPalette = true;
      return;
    }

    // Cmd/Ctrl + S: Save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveProject();
      return;
    }

    // Cmd/Ctrl + Z: Undo
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    // Cmd/Ctrl + Shift + Z: Redo
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
      e.preventDefault();
      redo();
      return;
    }

    // Cmd/Ctrl + E: Export
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      showExport = true;
      return;
    }

    // Cmd/Ctrl + O: Import
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      showImport = true;
      return;
    }

    // ?: Help
    if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      showHelp = true;
      return;
    }

    // Tool shortcuts
    switch (e.key.toLowerCase()) {
      case 'v':
      case 'escape':
        selectedTool.set('select');
        break;
      case 'w':
        selectedTool.set('wall');
        break;
      case 'd':
        selectedTool.set('door');
        break;
      case 'i':
        selectedTool.set('window');
        break;
      case 'f':
        selectedTool.set('furniture');
        break;
      case 't':
        selectedTool.set('text');
        break;
      case 'm':
        selectedTool.set('measure');
        break;
      case 'g':
        gridEnabled.update(v => !v);
        break;
      case 's':
        if (!e.metaKey && !e.ctrlKey) snapEnabled.update(v => !v);
        break;
    }
  }

  function closeAllMenus() {
    showFileMenu = false;
    showEditMenu = false;
    showViewMenu = false;
    showFloorMenu = false;
  }

  function handleExport(format: string) {
    const p = get(currentProject);
    if (!p) return;
    switch (format) {
      case 'png':
        if (canvas) exportAsPNG(canvas, p);
        break;
      case 'svg':
        exportAsSVG(p);
        break;
      case 'dxf':
        exportDXF(p);
        break;
      case 'pdf':
        exportPDF(p);
        break;
      case 'json':
        exportAsJSON(p);
        break;
    }
    showExport = false;
  }

  // Tool definitions for the toolbar
  const tools = [
    { id: 'select', icon: 'cursor', label: 'Select', shortcut: 'V' },
    { id: 'wall', icon: 'wall', label: 'Wall', shortcut: 'W' },
    { id: 'door', icon: 'door', label: 'Door', shortcut: 'D' },
    { id: 'window', icon: 'window', label: 'Window', shortcut: 'I' },
    { id: 'furniture', icon: 'furniture', label: 'Furniture', shortcut: 'F' },
    { id: 'text', icon: 'text', label: 'Text', shortcut: 'T' },
    { id: 'measure', icon: 'measure', label: 'Measure', shortcut: 'M' },
  ] as const;

  function getToolIcon(icon: string) {
    switch (icon) {
      case 'cursor':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>';
      case 'wall':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg>';
      case 'door':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V4a2 2 0 00-2-2z"/><circle cx="15" cy="12" r="1"/></svg>';
      case 'window':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>';
      case 'furniture':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10V7a2 2 0 00-2-2H6a2 2 0 00-2 2v3"/><path d="M4 10h16a2 2 0 012 2v5a2 2 0 01-2 2H4a2 2 0 01-2-2v-5a2 2 0 012-2z"/><path d="M6 19v2M18 19v2"/></svg>';
      case 'text':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>';
      case 'measure':
        return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.3 8.7l-8.6-8.6a1 1 0 00-1.4 0l-8.6 8.6a1 1 0 000 1.4l8.6 8.6a1 1 0 001.4 0l8.6-8.6a1 1 0 000-1.4z"/><path d="M7.5 11.5l1-1M10.5 8.5l1-1M13.5 11.5l1-1M16.5 8.5l1-1"/></svg>';
      default:
        return '';
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onclick={closeAllMenus} />

<!-- Top Bar -->
<div class="h-12 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center px-2 gap-1 border-b border-slate-600/50 select-none">
  <!-- Logo / Back -->
  <a href={base || '/'} class="flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors"
    title="Back to Projects">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  </a>

  <div class="w-px h-6 bg-slate-600 mx-1"></div>

  <!-- File Menu -->
  <div class="relative">
    <button
      onclick={(e) => { e.stopPropagation(); closeAllMenus(); showFileMenu = !showFileMenu; }}
      class="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
    >
      File
    </button>
    {#if showFileMenu}
      <div class="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
        <button onclick={() => { saveProject(); closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>Save</span>
          <span class="text-xs text-white/40">⌘S</span>
        </button>
        <button onclick={() => { showExport = true; closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>Export...</span>
          <span class="text-xs text-white/40">⌘E</span>
        </button>
        <button onclick={() => { showImport = true; closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>Import...</span>
          <span class="text-xs text-white/40">⌘O</span>
        </button>
        <div class="h-px bg-slate-600 my-1"></div>
        <button onclick={() => { showSettings = true; closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left">
          Settings
        </button>
      </div>
    {/if}
  </div>

  <!-- Edit Menu -->
  <div class="relative">
    <button
      onclick={(e) => { e.stopPropagation(); closeAllMenus(); showEditMenu = !showEditMenu; }}
      class="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
    >
      Edit
    </button>
    {#if showEditMenu}
      <div class="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
        <button onclick={() => { undo(); closeAllMenus(); }} disabled={!$canUndo} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed">
          <span>Undo</span>
          <span class="text-xs text-white/40">⌘Z</span>
        </button>
        <button onclick={() => { redo(); closeAllMenus(); }} disabled={!$canRedo} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed">
          <span>Redo</span>
          <span class="text-xs text-white/40">⇧⌘Z</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- View Menu -->
  <div class="relative">
    <button
      onclick={(e) => { e.stopPropagation(); closeAllMenus(); showViewMenu = !showViewMenu; }}
      class="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
    >
      View
    </button>
    {#if showViewMenu}
      <div class="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
        <button onclick={() => { gridEnabled.update(v => !v); closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>{$gridEnabled ? '✓ ' : ''}Grid</span>
          <span class="text-xs text-white/40">G</span>
        </button>
        <button onclick={() => { snapEnabled.update(v => !v); closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>{$snapEnabled ? '✓ ' : ''}Snap</span>
          <span class="text-xs text-white/40">S</span>
        </button>
        <button onclick={() => { showDimensions.update(v => !v); closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left">
          <span>{$showDimensions ? '✓ ' : ''}Dimensions</span>
        </button>
        <div class="h-px bg-slate-600 my-1"></div>
        <button onclick={() => { if (onZoomIn) onZoomIn(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>Zoom In</span>
          <span class="text-xs text-white/40">+</span>
        </button>
        <button onclick={() => { if (onZoomOut) onZoomOut(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>Zoom Out</span>
          <span class="text-xs text-white/40">-</span>
        </button>
        <button onclick={() => { if (onZoomReset) onZoomReset(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center justify-between">
          <span>Reset Zoom</span>
          <span class="text-xs text-white/40">0</span>
        </button>
        <button onclick={() => { if (onZoomFit) onZoomFit(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left">
          <span>Fit to Screen</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Floor Menu -->
  <div class="relative">
    <button
      onclick={(e) => { e.stopPropagation(); closeAllMenus(); showFloorMenu = !showFloorMenu; }}
      class="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
    >
      Floor: {currentFloor?.name || 'Ground'}
    </button>
    {#if showFloorMenu}
      <div class="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px] z-50">
        {#each floors as floor, i}
          <button
            onclick={() => { currentFloorIndex.set(i); closeAllMenus(); }}
            class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left flex items-center gap-2"
          >
            {#if i === floorIndex}
              <span class="text-blue-400">●</span>
            {:else}
              <span class="text-transparent">●</span>
            {/if}
            {floor.name}
          </button>
        {/each}
        <div class="h-px bg-slate-600 my-1"></div>
        <button onclick={() => { addFloor(); closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left">
          + Add Floor
        </button>
        <button onclick={() => { duplicateFloor(); closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 text-left">
          Duplicate Floor
        </button>
        {#if floors.length > 1}
          <button onclick={() => { deleteFloor(); closeAllMenus(); }} class="w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/10 text-left">
            Delete Floor
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Help -->
  <button
    onclick={() => showHelp = true}
    class="px-3 py-1.5 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded transition-colors"
  >
    Help
  </button>

  <div class="flex-1"></div>

  <!-- Tool Bar -->
  <div class="flex items-center gap-0.5 bg-slate-900/50 rounded-lg p-0.5">
    {#each tools as tool}
      <button
        onclick={() => selectedTool.set(tool.id)}
        class="w-8 h-8 flex items-center justify-center rounded transition-all"
        class:bg-blue-500={$selectedTool === tool.id}
        class:text-white={$selectedTool === tool.id}
        class:text-white/60={$selectedTool !== tool.id}
        class:hover:text-white={$selectedTool !== tool.id}
        class:hover:bg-white/10={$selectedTool !== tool.id}
        title="{tool.label} ({tool.shortcut})"
      >
        {@html getToolIcon(tool.icon)}
      </button>
    {/each}
  </div>

  <div class="w-px h-6 bg-slate-600 mx-2"></div>

  <!-- View Mode Toggle -->
  <div class="flex items-center gap-0.5 bg-slate-900/50 rounded-lg p-0.5">
    <button
      onclick={() => viewMode.set('2d')}
      class="px-3 py-1.5 text-sm rounded transition-all"
      class:bg-blue-500={$viewMode === '2d'}
      class:text-white={$viewMode === '2d'}
      class:text-white/60={$viewMode !== '2d'}
      class:hover:text-white={$viewMode !== '2d'}
    >
      2D
    </button>
    <button
      onclick={() => viewMode.set('3d')}
      class="px-3 py-1.5 text-sm rounded transition-all"
      class:bg-blue-500={$viewMode === '3d'}
      class:text-white={$viewMode === '3d'}
      class:text-white/60={$viewMode !== '3d'}
      class:hover:text-white={$viewMode !== '3d'}
    >
      3D
    </button>
  </div>

  <div class="w-px h-6 bg-slate-600 mx-2"></div>

  <!-- Zoom -->
  <div class="flex items-center gap-1">
    <button
      onclick={() => { if (onZoomOut) onZoomOut(); }}
      class="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
      title="Zoom Out"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <span class="text-xs text-white/60 w-12 text-center">{Math.round(currentZoom * 100)}%</span>
    <button
      onclick={() => { if (onZoomIn) onZoomIn(); }}
      class="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
      title="Zoom In"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  </div>

  <div class="w-px h-6 bg-slate-600 mx-2"></div>

  <!-- Command Palette Button -->
  <button
    onclick={() => showCommandPalette = true}
    class="flex items-center gap-2 px-3 py-1.5 text-sm text-white/60 hover:text-white bg-slate-900/50 hover:bg-slate-900 rounded-lg transition-colors"
    title="Command Palette (⌘K)"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <span class="hidden sm:inline">Search</span>
    <kbd class="hidden sm:inline text-[10px] px-1.5 py-0.5 bg-slate-700 rounded border border-slate-600 text-white/40">⌘K</kbd>
  </button>
</div>

<!-- Modals -->
<ExportModal bind:open={showExport} onExport={handleExport} />
<ImportModal bind:open={showImport} {onSaveStateCallback} />
<SettingsModal bind:open={showSettings} />
<HelpModal bind:open={showHelp} />
<CommandPalette bind:open={showCommandPalette} />
