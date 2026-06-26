<script lang="ts">
  import { selectedTool, placingFurnitureId, placingDoorType, placingWindowType, placingStair, addStair, placingColumn, placingColumnShape, activeFloor, setBackgroundImage, canvasCamX, canvasCamY } from '$lib/stores/project';
  import type { Tool } from '$lib/stores/project';
  import type { Door, Window as Win } from '$lib/models/types';
  import { roomPresets, placePreset } from '$lib/utils/roomPresets';
  import { roomTemplates, placeRoomTemplate } from '$lib/utils/roomTemplates';
  import { furnitureCatalog, furnitureCategories } from '$lib/utils/furnitureCatalog';
  import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
  import { getModelFile, generateThumbnail, getThumbnail, preloadThumbnails } from '$lib/utils/furnitureThumbnails';
  import { onMount } from 'svelte';
  import { importRoomPlan, extractRoomJsonFromZip, ORTHO_VERSION } from '$lib/utils/roomplanImport';
  import { currentProject, loadProject, importFloorIntoCurrentProject, createDefaultProject } from '$lib/stores/project';
  import type { Project } from '$lib/models/types';

  // AreaSummaryPanel moved to top bar dialog
  let activeTab = $state<'draw' | 'furniture'>('draw');

  // Build sub-section open states
  let wallOpen = $state(true);
  let flooringOpen = $state(false);
  let ceilingOpen = $state(false);
  let openingOpen = $state(true);
  let structuresOpen = $state(false);
  let roomOpen = $state(false);
  let annotateOpen = $state(false);
  let importOpen = $state(false);

  // Legacy — kept for compat; unused after restructure
  let constructionOpen = $state(true);
  let selectedCategory = $state<string>('All');
  let thumbsReady = $state(0); // increment to trigger reactivity

  onMount(() => {
    // Preload thumbnails, re-render as each completes
    const files = new Set(furnitureCatalog.map(f => getModelFile(f.id)).filter(Boolean) as string[]);
    for (const file of files) {
      generateThumbnail(file).then(() => { thumbsReady++; });
    }
  });

  // RoomPlan import dialog state
  let showImportDialog = $state(false);
  let importFileName = $state('');
  let importJsonData: any = $state(null);
  let optStraighten = $state(true);
  let optOrthogonal = $state(true);
  let optMergeDistance = $state(15);

  function setTool(tool: Tool) {
    selectedTool.set(tool);
    placingFurnitureId.set(null);
  }

  let currentTool = $state<Tool>('select');
  selectedTool.subscribe((t) => { currentTool = t; });

  let currentPlacing = $state<string | null>(null);
  placingFurnitureId.subscribe((id) => { currentPlacing = id; });

  function onPresetClick(presetId: string, templateName?: string) {
    const preset = roomPresets.find(p => p.id === presetId);
    if (preset) {
      let cx = 0, cy = 0;
      canvasCamX.subscribe(v => { cx = v; })();
      canvasCamY.subscribe(v => { cy = v; })();
      const template = templateName ? roomTemplates.find(t => t.name === templateName) ?? null : null;
      placeRoomTemplate(preset, { x: cx, y: cy }, template);
    }
  }

  function onFurnitureClick(item: FurnitureDef) {
    selectedTool.set('furniture');
    placingFurnitureId.set(item.id);
    addToRecent(item.id);
  }

  let withFurniture = $state(true);

  let search = $state('');

  // --- Recent Items (localStorage) ---
  const RECENT_KEY = 'o3d_recent_furniture';
  const MAX_RECENT = 10;
  let recentIds = $state<string[]>((() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  })());

  function addToRecent(id: string) {
    recentIds = [id, ...recentIds.filter(r => r !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
  }

  let recentItems = $derived(
    recentIds.map(id => furnitureCatalog.find(f => f.id === id)).filter(Boolean) as FurnitureDef[]
  );

  // --- Favorites (localStorage) ---
  const FAV_KEY = 'o3d_favorite_furniture';
  let favoriteIds = $state<string[]>((() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
  })());

  function toggleFavorite(id: string) {
    if (favoriteIds.includes(id)) {
      favoriteIds = favoriteIds.filter(f => f !== id);
    } else {
      favoriteIds = [...favoriteIds, id];
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(favoriteIds));
  }

  let favoriteItems = $derived(
    favoriteIds.map(id => furnitureCatalog.find(f => f.id === id)).filter(Boolean) as FurnitureDef[]
  );

  let filtered = $derived(
    (() => {
      const s = search.toLowerCase();
      let items = selectedCategory === 'Favorites'
        ? favoriteItems
        : furnitureCatalog.filter((f) => {
            const matchCat = selectedCategory === 'All' || f.category === selectedCategory;
            return matchCat;
          });
      if (s) {
        items = items.filter(f => f.name.toLowerCase().includes(s));
      }
      return items;
    })()
  );

  const doorCatalog: { type: Door['type']; name: string; desc: string; icon: string }[] = [
    { type: 'single', name: 'Single', desc: '90cm swing', icon: 'M6 3h12v18H6z' },
    { type: 'double', name: 'Double', desc: '150cm swing', icon: 'M3 3h8v18H3zM13 3h8v18h-8z' },
    { type: 'sliding', name: 'Sliding', desc: '180cm slide', icon: 'M3 6h18v12H3z' },
    { type: 'french', name: 'French', desc: '150cm glass', icon: 'M3 3h8v18H3zM13 3h8v18h-8z' },
    { type: 'pocket', name: 'Pocket', desc: '90cm recess', icon: 'M6 3h12v18H6z' },
    { type: 'bifold', name: 'Bifold', desc: '180cm fold', icon: 'M3 3h5v18H3zM9 3h6v18H9zM16 3h5v18h-5z' },
  ];

  const windowCatalog: { type: Win['type']; name: string; desc: string }[] = [
    { type: 'standard', name: 'Standard', desc: '120×120cm' },
    { type: 'fixed', name: 'Fixed', desc: '100×100cm' },
    { type: 'casement', name: 'Casement', desc: '80×130cm' },
    { type: 'sliding', name: 'Sliding', desc: '180×120cm' },
    { type: 'bay', name: 'Bay', desc: '200×150cm' },
  ];

  let selectedDoorType = $state<Door['type']>('single');
  let selectedWindowType = $state<Win['type']>('standard');

  function setDoorType(type: Door['type']) {
    selectedDoorType = type;
    placingDoorType.set(type);
    setTool('door');
  }

  function setWindowType(type: Win['type']) {
    selectedWindowType = type;
    placingWindowType.set(type);
    setTool('window');
  }

  let isPlacingStair = $state(false);
  placingStair.subscribe(v => { isPlacingStair = v; });

  let isPlacingColumn = $state(false);
  placingColumn.subscribe(v => { isPlacingColumn = v; });

  function onPlaceStair() {
    placingStair.set(true);
    selectedTool.set('select');
    placingFurnitureId.set(null);
  }

  function onPlaceColumn(shape: 'round' | 'square') {
    placingColumn.set(true);
    placingColumnShape.set(shape);
    selectedTool.set('select');
    placingFurnitureId.set(null);
  }

  function onImportImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('Warning: Image is larger than 5MB. This may slow down the application.');
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setBackgroundImage({
          dataUrl,
          position: { x: 0, y: 0 },
          scale: 1,
          opacity: 0.4,
          rotation: 0,
          locked: false,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function onImportRoomPlan() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        let jsonData: any;
        if (file.name.endsWith('.zip')) {
          jsonData = await extractRoomJsonFromZip(file);
        } else {
          const text = await file.text();
          jsonData = JSON.parse(text);
        }
        importJsonData = jsonData;
        importFileName = file.name.replace(/\.(json|zip)$/, '');
        showImportDialog = true;
      } catch (e: any) {
        alert('Failed to read RoomPlan file: ' + e.message);
      }
    };
    input.click();
  }

  function confirmImport() {
    if (!importJsonData) return;
    try {
      const floor = importRoomPlan(importJsonData, {
        straighten: optStraighten,
        orthogonal: optOrthogonal,
        mergeDistance: optMergeDistance,
      });
      // Create a new project for the imported data instead of merging into current
      const projectName = importFileName ? importFileName.replace(/\.(json|zip)$/i, '') : 'RoomPlan Import';
      const newProject = createDefaultProject(projectName);
      const activeFloor = newProject.floors[0];
      activeFloor.walls = floor.walls;
      activeFloor.doors = floor.doors;
      activeFloor.windows = floor.windows;
      activeFloor.furniture = floor.furniture;
      if (floor.stairs) activeFloor.stairs = floor.stairs;
      if (floor.columns) activeFloor.columns = floor.columns;
      loadProject(newProject);
    } catch (e: any) {
      alert('Failed to import RoomPlan: ' + e.message);
    }
    showImportDialog = false;
    importJsonData = null;
  }

  function cancelImport() {
    showImportDialog = false;
    importJsonData = null;
  }

  // --- Hover Preview Tooltip ---
  let hoveredItem = $state<FurnitureDef | null>(null);
  let hoverTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let hoverPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  let showPreview = $state(false);

  function onItemMouseEnter(e: MouseEvent, item: FurnitureDef) {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoveredItem = item;
    updateHoverPos(e);
    hoverTimeout = setTimeout(() => { showPreview = true; }, 300);
  }

  function onItemMouseMove(e: MouseEvent) {
    updateHoverPos(e);
  }

  function onItemMouseLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = null;
    showPreview = false;
    hoveredItem = null;
  }

  function updateHoverPos(e: MouseEvent) {
    const sidebarRight = 256; // w-64 = 16rem = 256px
    const viewportW = window.innerWidth;
    const tooltipW = 220;
    // Position to the right of sidebar, or left if no space
    const x = (sidebarRight + tooltipW + 8) < viewportW ? sidebarRight + 8 : -tooltipW - 8;
    // Vertically align near the mouse, clamped to viewport
    const y = Math.min(Math.max(e.clientY - 40, 8), window.innerHeight - 200);
    hoverPos = { x, y };
  }

  const categoryColors: Record<string, string> = {
    'Living Room': '#a78bfa',
    'Bedroom': '#60a5fa',
    'Kitchen': '#f87171',
    'Bathroom': '#93c5fd',
    'Office': '#34d399',
    'Dining': '#f59e0b',
    'Decor': '#c2956b',
    'Lighting': '#fbbf24',
    'Outdoor Furniture': '#b45309',
    'Landscaping': '#16a34a',
    'Fencing': '#a16207',
    'Structures': '#6b7280',
    'Electrical': '#2563eb',
    'Plumbing': '#0ea5e9',
  };
</script>

<div class="w-64 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
  <!-- Tabs -->
  <div class="flex border-b border-gray-200">
    <button
      class="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide {activeTab === 'draw' ? 'text-slate-800 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}"
      onclick={() => activeTab = 'draw'}
    >Build</button>
    <button
      class="flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide {activeTab === 'furniture' ? 'text-slate-800 border-b-2 border-blue-500 bg-blue-50' : 'text-gray-500 hover:text-gray-700'}"
      onclick={() => activeTab = 'furniture'}
    >Furniture</button>
  </div>

  <div class="flex-1 overflow-y-auto p-3">
    {#if activeTab === 'draw'}
      <div class="space-y-0.5">

        <!-- 1. Wall -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => wallOpen = !wallOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Wall</span>
          <span class="text-gray-400 text-xs">{wallOpen ? '▼' : '▶'}</span>
        </button>
        {#if wallOpen}
          <div class="space-y-1 pb-2">
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'select' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
              onclick={() => setTool('select')}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'select' ? 'bg-blue-100' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Select <span class="text-gray-400 text-xs ml-1">V</span></div>
                <div class="text-xs text-gray-400">Click to select elements</div>
              </div>
            </button>
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'wall' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
              onclick={() => setTool('wall')}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'wall' ? 'bg-blue-100' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="8" rx="1"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Draw Wall <span class="text-gray-400 text-xs ml-1">W</span></div>
                <div class="text-xs text-gray-400">Click to draw, dbl-click to finish</div>
              </div>
            </button>
          </div>
        {/if}

        <!-- 2. Flooring -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => flooringOpen = !flooringOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Flooring</span>
          <span class="text-gray-400 text-xs">{flooringOpen ? '▼' : '▶'}</span>
        </button>
        {#if flooringOpen}
          <div class="pb-2 px-2">
            <p class="text-xs text-gray-400 py-2">Select a room in the Design (3D) view to set floor materials.</p>
          </div>
        {/if}

        <!-- 3. Ceiling -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => ceilingOpen = !ceilingOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Ceiling</span>
          <span class="text-gray-400 text-xs">{ceilingOpen ? '▼' : '▶'}</span>
        </button>
        {#if ceilingOpen}
          <div class="pb-2 px-2">
            <p class="text-xs text-gray-400 py-2">Ceiling height is set per-wall via wall properties.</p>
          </div>
        {/if}

        <!-- 4. Opening (Door + Window) -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => openingOpen = !openingOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Opening</span>
          <span class="text-gray-400 text-xs">{openingOpen ? '▼' : '▶'}</span>
        </button>
        {#if openingOpen}
          <div class="pb-2">
            <p class="text-[10px] text-gray-400 px-2 mb-1">Doors</p>
            <div class="grid grid-cols-2 gap-2 mb-3">
              {#each doorCatalog as dc}
                <button
                  class="flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-colors cursor-grab active:cursor-grabbing {currentTool === 'door' && selectedDoorType === dc.type ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}"
                  onclick={() => setDoorType(dc.type)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'door'); e.dataTransfer?.setData('application/o3d-id', dc.type); }}
                >
                  <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#92400e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="{dc.icon}"/></svg>
                  </div>
                  <span class="text-xs font-medium text-gray-600">{dc.name}</span>
                  <span class="text-[10px] text-gray-400">{dc.desc}</span>
                </button>
              {/each}
            </div>
            <p class="text-[10px] text-gray-400 px-2 mb-1">Windows</p>
            <div class="grid grid-cols-2 gap-2">
              {#each windowCatalog as wc}
                <button
                  class="flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-colors cursor-grab active:cursor-grabbing {currentTool === 'window' && selectedWindowType === wc.type ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}"
                  onclick={() => setWindowType(wc.type)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'window'); e.dataTransfer?.setData('application/o3d-id', wc.type); }}
                >
                  <div class="w-9 h-9 rounded-lg bg-cyan-50 flex items-center justify-center">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0e7490" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
                  </div>
                  <span class="text-xs font-medium text-gray-600">{wc.name}</span>
                  <span class="text-[10px] text-gray-400">{wc.desc}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 5. Structures (Staircase + Column) -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => structuresOpen = !structuresOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Structures</span>
          <span class="text-gray-400 text-xs">{structuresOpen ? '▼' : '▶'}</span>
        </button>
        {#if structuresOpen}
          <div class="space-y-1 pb-2">
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {isPlacingStair ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
              onclick={onPlaceStair}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {isPlacingStair ? 'bg-blue-100' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 5h-5V2h-3v6h-4V5H7v6H2v3h5v3h3v-3h4v3h3v-6h5z"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Staircase</div>
                <div class="text-xs text-gray-400">Click to place stairs</div>
              </div>
            </button>
            <div class="flex gap-2">
              <button
                class="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors {isPlacingColumn ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
                onclick={() => onPlaceColumn('round')}
              >
                <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {isPlacingColumn ? 'bg-blue-100' : ''}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6"/><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                </div>
                <div class="text-left"><div class="font-medium text-xs">Round Column</div></div>
              </button>
              <button
                class="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors {isPlacingColumn ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
                onclick={() => onPlaceColumn('square')}
              >
                <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {isPlacingColumn ? 'bg-blue-100' : ''}">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12"/><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                </div>
                <div class="text-left"><div class="font-medium text-xs">Square Column</div></div>
              </button>
            </div>
          </div>
        {/if}

        <!-- 6. Room -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => roomOpen = !roomOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Room</span>
          <span class="text-gray-400 text-xs">{roomOpen ? '▼' : '▶'}</span>
        </button>
        {#if roomOpen}
          <div class="pb-2">
            <p class="text-[10px] text-gray-400 px-2 mb-1">Presets</p>
            <div class="grid grid-cols-2 gap-2 mb-3">
              {#each roomPresets as preset}
                <button
                  class="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-grab active:cursor-grabbing"
                  onclick={() => onPresetClick(preset.id)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'room'); e.dataTransfer?.setData('application/o3d-id', preset.id); }}
                >
                  <div class="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center text-2xl font-mono">{preset.icon}</div>
                  <span class="text-xs font-medium text-gray-600">{preset.name}</span>
                </button>
              {/each}
            </div>
            <p class="text-[10px] text-gray-400 px-2 mb-1">Templates</p>
            <div class="grid grid-cols-2 gap-2">
              {#each roomTemplates as tmpl}
                <button
                  class="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-gray-100 hover:border-green-300 hover:bg-green-50 transition-colors cursor-grab active:cursor-grabbing"
                  onclick={() => onPresetClick(tmpl.presetId, tmpl.name)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'room-template'); e.dataTransfer?.setData('application/o3d-id', tmpl.name); }}
                >
                  <div class="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center text-lg">
                    {#if tmpl.name === 'Living Room'}🛋️
                    {:else if tmpl.name === 'Bedroom'}🛏️
                    {:else if tmpl.name === 'Kitchen'}🍳
                    {:else if tmpl.name === 'Bathroom'}🛁
                    {:else if tmpl.name === 'Office'}🖥️
                    {:else if tmpl.name === 'Dining Room'}🍽️
                    {:else}🏠
                    {/if}
                  </div>
                  <span class="text-xs font-medium text-gray-600">{tmpl.name}</span>
                  <span class="text-[10px] text-gray-400">{tmpl.furniture.length} items</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Annotation -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => annotateOpen = !annotateOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Annotation</span>
          <span class="text-gray-400 text-xs">{annotateOpen ? '▼' : '▶'}</span>
        </button>
        {#if annotateOpen}
          <div class="space-y-1 pb-2">
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'text' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
              onclick={() => setTool('text')}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'text' ? 'bg-blue-100' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Text Label</div>
                <div class="text-xs text-gray-400">Add text annotations (T)</div>
              </div>
            </button>
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'annotate' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
              onclick={() => setTool('annotate')}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'annotate' ? 'bg-blue-100' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><line x1="16" y1="5" x2="22" y2="5"/><line x1="19" y1="2" x2="19" y2="8"/><line x1="3" y1="12" x2="12" y2="12"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Dimension</div>
                <div class="text-xs text-gray-400">Add dimension annotations (N)</div>
              </div>
            </button>
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors {currentTool === 'measure' ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
              onclick={() => setTool('measure')}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center {currentTool === 'measure' ? 'bg-blue-100' : ''}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h5l2-7 4 14 2-7h7"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Measure</div>
                <div class="text-xs text-gray-400">Measure distances (M)</div>
              </div>
            </button>
          </div>
        {/if}

        <!-- Import -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => importOpen = !importOpen}>
          <span class="text-xs font-bold uppercase tracking-wide text-gray-600">Import</span>
          <span class="text-gray-400 text-xs">{importOpen ? '▼' : '▶'}</span>
        </button>
        {#if importOpen}
          <div class="space-y-1 pb-2">
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-gray-50 text-gray-700"
              onclick={onImportImage}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Import Image</div>
                <div class="text-xs text-gray-400">Floor plan background</div>
              </div>
            </button>
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-gray-50 text-gray-700"
              onclick={onImportRoomPlan}
            >
              <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
              <div class="text-left">
                <div class="font-medium">Import RoomPlan</div>
                <div class="text-xs text-gray-400">iOS LiDAR scan (.json/.zip)</div>
              </div>
            </button>
          </div>
        {/if}
      </div>

    {:else if activeTab === 'furniture'}
      <div class="space-y-2">
        <!-- Search with clear button and result count -->
        <div class="relative">
          <input
            type="text"
            placeholder="Search furniture..."
            class="w-full px-3 py-2 pr-8 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            bind:value={search}
          />
          {#if search}
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100"
              onclick={() => search = ''}
              title="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          {/if}
        </div>
        {#if search}
          <div class="text-[10px] text-gray-400 px-1">{filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"</div>
        {/if}
        <!-- Category filter -->
        <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          <button
            class="px-2 py-0.5 rounded-full text-[10px] font-medium {selectedCategory === 'All' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
            onclick={() => selectedCategory = 'All'}
          >All</button>
          <button
            class="px-2 py-0.5 rounded-full text-[10px] font-medium {selectedCategory === 'Favorites' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
            onclick={() => selectedCategory = 'Favorites'}
          >♥ Favorites{favoriteIds.length ? ` (${favoriteIds.length})` : ''}</button>
          {#each furnitureCategories as cat}
            <button
              class="px-2 py-0.5 rounded-full text-[10px] font-medium {selectedCategory === cat ? 'text-white' : 'text-gray-600 hover:bg-gray-200'}"
              style={selectedCategory === cat ? `background-color: ${categoryColors[cat] ?? '#6b7280'}` : 'background-color: #f3f4f6'}
              onclick={() => selectedCategory = cat}
            >{cat}</button>
          {/each}
        </div>

        <!-- Recent Items -->
        {#if !search && selectedCategory === 'All' && recentItems.length > 0}
          <div class="mt-1">
            <h4 class="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">Recent</h4>
            <div class="grid grid-cols-2 gap-2">
              {#each recentItems as item}
                <button
                  class="relative flex flex-col items-center gap-1 p-2.5 rounded-lg border-2 transition-colors cursor-grab active:cursor-grabbing {currentPlacing === item.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50'}"
                  onclick={() => onFurnitureClick(item)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
                  onmouseenter={(e) => onItemMouseEnter(e, item)}
                  onmousemove={onItemMouseMove}
                  onmouseleave={onItemMouseLeave}
                >
                  <!-- svelte-ignore node_invalid_placement -->
                  <span
                    role="button"
                    tabindex="0"
                    class="absolute top-1 right-1 text-[12px] leading-none cursor-pointer {favoriteIds.includes(item.id) ? 'text-pink-500' : 'text-gray-300 hover:text-pink-400'}"
                    onclick={(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(item.id); }}
                    onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(item.id); } }}
                    title={favoriteIds.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >{favoriteIds.includes(item.id) ? '♥' : '♡'}</span>
                  {#if thumbsReady >= 0 && getModelFile(item.id) && getThumbnail(getModelFile(item.id)!)}
                    <img src={getThumbnail(getModelFile(item.id)!)} alt={item.name} class="w-10 h-10 object-contain" />
                  {:else}
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background-color: {item.color}20">
                      <div class="w-4 h-4 rounded-sm" style="background-color: {item.color}; opacity: 0.7"></div>
                    </div>
                  {/if}
                  <span class="text-[10px] font-medium text-gray-600 leading-tight text-center">{item.name}</span>
                </button>
              {/each}
            </div>
          </div>
          <hr class="border-gray-100" />
        {/if}

        <!-- Catalog grid -->
        <div class="grid grid-cols-2 gap-2 mt-2">
          {#each filtered as item}
            {@const s = search.toLowerCase()}
            <button
              class="relative flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors cursor-grab active:cursor-grabbing {currentPlacing === item.id ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50'}"
              onclick={() => onFurnitureClick(item)}
              draggable="true"
              ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
              onmouseenter={(e) => onItemMouseEnter(e, item)}
              onmousemove={onItemMouseMove}
              onmouseleave={onItemMouseLeave}
            >
              <!-- svelte-ignore node_invalid_placement -->
              <span
                role="button"
                tabindex="0"
                class="absolute top-1 right-1 text-[12px] leading-none cursor-pointer {favoriteIds.includes(item.id) ? 'text-pink-500' : 'text-gray-300 hover:text-pink-400'}"
                onclick={(e: MouseEvent) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(item.id); }}
                onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.stopPropagation(); toggleFavorite(item.id); } }}
                title={favoriteIds.includes(item.id) ? 'Remove from favorites' : 'Add to favorites'}
              >{favoriteIds.includes(item.id) ? '♥' : '♡'}</span>
              {#if thumbsReady >= 0 && getModelFile(item.id) && getThumbnail(getModelFile(item.id)!)}
                <img src={getThumbnail(getModelFile(item.id)!)} alt={item.name} class="w-12 h-12 object-contain" />
              {:else}
                <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background-color: {item.color}20">
                  <div class="w-5 h-5 rounded-sm" style="background-color: {item.color}; opacity: 0.7"></div>
                </div>
              {/if}
              {#if s && item.name.toLowerCase().includes(s)}
                {@const idx = item.name.toLowerCase().indexOf(s)}
                <span class="text-xs font-medium text-gray-600">{item.name.slice(0, idx)}<mark class="bg-yellow-200 text-gray-800 rounded-sm px-0.5">{item.name.slice(idx, idx + s.length)}</mark>{item.name.slice(idx + s.length)}</span>
              {:else}
                <span class="text-xs font-medium text-gray-600">{item.name}</span>
              {/if}
              <span class="text-[10px] text-gray-400">{item.width}×{item.depth}cm</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Furniture Hover Preview Tooltip -->
{#if showPreview && hoveredItem}
  {@const item = hoveredItem}
  <div
    class="fixed z-50 pointer-events-none"
    style="left: {hoverPos.x}px; top: {hoverPos.y}px;"
  >
    <div class="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden" style="width: 220px;">
      <div class="w-full h-[120px] bg-gray-50 flex items-center justify-center p-3">
        {#if thumbsReady >= 0 && getModelFile(item.id) && getThumbnail(getModelFile(item.id)!)}
          <img src={getThumbnail(getModelFile(item.id)!)} alt={item.name} class="max-w-full max-h-full object-contain" style="image-rendering: auto;" />
        {:else}
          <div class="w-16 h-16 rounded-xl flex items-center justify-center" style="background-color: {item.color}20">
            <div class="w-10 h-10 rounded-md" style="background-color: {item.color}; opacity: 0.7"></div>
          </div>
        {/if}
      </div>
      <div class="p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-800">{item.name}</span>
          <span
            class="px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white"
            style="background-color: {categoryColors[item.category] ?? '#6b7280'}"
          >{item.category}</span>
        </div>
        <div class="text-xs text-gray-500">
          {item.width} × {item.depth} × {item.height} cm
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- RoomPlan Import Options Dialog -->
{#if showImportDialog}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onclick={cancelImport}>
    <div class="bg-white rounded-xl shadow-2xl w-80 p-5" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-sm font-bold text-gray-800 mb-1">Import RoomPlan</h3>
      <p class="text-xs text-gray-400 mb-4">{importFileName}</p>

      <div class="space-y-3">
        <label class="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" bind:checked={optStraighten} class="accent-blue-500 mt-0.5" />
          <div>
            <div class="text-sm font-medium text-gray-700">Straighten walls</div>
            <div class="text-xs text-gray-400">Snap near-horizontal/vertical walls to axis</div>
          </div>
        </label>

        <label class="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" bind:checked={optOrthogonal} class="accent-blue-500 mt-0.5" />
          <div>
            <div class="text-sm font-medium text-gray-700">Enforce orthogonal <span class="text-xs text-blue-400 font-mono">{ORTHO_VERSION}</span></div>
            <div class="text-xs text-gray-400">Force all walls to 90°/180° angles</div>
          </div>
        </label>

        <label class="block">
          <div class="text-xs text-gray-500 mb-1">Corner merge distance (cm)</div>
          <input type="number" bind:value={optMergeDistance} min="0" max="50" step="5" class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
        </label>
      </div>

      <div class="flex gap-2 mt-5">
        <button onclick={cancelImport} class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
        <button onclick={confirmImport} class="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">Import</button>
      </div>
    </div>
  </div>
{/if}
