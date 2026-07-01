<script lang="ts">
  import { selectedTool, placingFurnitureId, placingDoorType, placingWindowType, placingStair, placingStairType, addStair, placingColumn, placingColumnShape, activeFloor, setBackgroundImage, canvasCamX, canvasCamY, viewMode, placingRoomPresetId, placingRoomTemplateName, wallPaintColor, wallPaintTexture, wallPaintFace, addXRef, removeXRef, updateXRef, placingWallSubType, placingWallHeight, placingDetailId } from '$lib/stores/project';
  import { detailCatalog, detailCategories } from '$lib/utils/detailCatalog';
  import { get } from 'svelte/store';
  import type { Tool } from '$lib/stores/project';
  import type { Door, Window as Win, XRef, XRefDxf, XRefNative } from '$lib/models/types';
  import { roomPresets, placePreset } from '$lib/utils/roomPresets';
  import { wallColors, floorMaterials } from '$lib/utils/materials';
  import { roomTemplates, placeRoomTemplate } from '$lib/utils/roomTemplates';
  import { furnitureCatalog, furnitureCategories } from '$lib/utils/furnitureCatalog';
  import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
  import { getModelFile, generateThumbnail, getThumbnail, preloadThumbnails } from '$lib/utils/furnitureThumbnails';
  import { onMount } from 'svelte';
  import { importRoomPlan, extractRoomJsonFromZip, ORTHO_VERSION } from '$lib/utils/roomplanImport';
  import { currentProject, loadProject, importFloorIntoCurrentProject, createDefaultProject } from '$lib/stores/project';
  import type { Project } from '$lib/models/types';
  import { parseDxf, computeXRefSnapPoints } from '$lib/utils/dxfParser';
  import { placingEntourageDefId, addCustomEntourage, removeCustomEntourage } from '$lib/stores/project';
  import { entourageCatalog, entourageCategories } from '$lib/utils/entourageCatalog';
  import type { EntourageDef, CustomEntourageDef, EntourageViewType } from '$lib/models/types';
  import EntourageUploadDialog from '$lib/components/editor/EntourageUploadDialog.svelte';

  // AreaSummaryPanel moved to top bar dialog
  let activeTab = $state<'draw' | 'furniture' | 'entourage'>('draw');

  // Entourage tab state
  let entourageViewFilter = $state<EntourageViewType>('plan');
  let entourageCategoryOpen = $state<Record<string, boolean>>({
    people: false,
    vehicles: true,
    trees: true,
    landscaping: true,
  });
  let currentPlacingEntourageId = $state<string | null>(null);
  placingEntourageDefId.subscribe(id => { currentPlacingEntourageId = id; });
  let showEntourageUpload = $state(false);
  let $customEntourage = $state<CustomEntourageDef[]>([]);
  currentProject.subscribe(p => { $customEntourage = p?.customEntourage ?? []; });

  // AEC top-level group open states
  let archOpen = $state(true);
  let structOpen = $state(false);
  let mepOpen = $state(false);
  let detailsOpen = $state(false);

  // Construction detail sub-accordion states (one per category label)
  let detailSubOpen = $state<Record<string, boolean>>({ Architecture: true, Structure: false, MEP: false });
  // Current detail being placed
  let currentPlacingDetailId = $state<string | null>(null);
  placingDetailId.subscribe(id => { currentPlacingDetailId = id; });

  // Build sub-section open states
  let wallDrawOpen = $state(true);
  let wallOpen = $state(false);
  let flooringOpen = $state(false);
  let ceilingOpen = $state(false);
  let openingOpen = $state(true);
  let structuresOpen = $state(false);
  let columnsOpen = $state(false);
  let roomOpen = $state(false);
  let annotateOpen = $state(false);
  let importOpen = $state(false);
  let xrefOpen = $state(false);

  // XRef import state
  let xrefDxfDialog = $state(false);
  let xrefDxfName = $state('');
  let xrefDxfScale = $state(0.1); // mm→cm default
  let xrefDxfText = $state('');

  let xrefNativeDialog = $state(false);
  let xrefNativeName = $state('');
  let xrefNativeJson = $state('');
  let xrefNativeFloorOptions = $state<{ label: string; index: number }[]>([]);
  let xrefNativeFloorIndex = $state(0);

  function uid() { return Math.random().toString(36).slice(2, 10); }

  function onLinkDxf() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.dxf';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      xrefDxfText = await file.text();
      xrefDxfName = file.name.replace(/\.dxf$/i, '');
      xrefDxfDialog = true;
    };
    input.click();
  }

  function confirmLinkDxf() {
    const entities = parseDxf(xrefDxfText, xrefDxfScale);
    const snapPoints = computeXRefSnapPoints(entities);
    const xref: XRefDxf = {
      id: uid(), name: xrefDxfName, type: 'dxf',
      position: { x: 0, y: 0 }, rotation: 0, scale: 1, opacity: 0.7, visible: true,
      sourceText: xrefDxfText, entities, snapPoints,
    };
    addXRef(xref);
    xrefDxfDialog = false; xrefDxfText = '';
  }

  function onLinkNative() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.carpentra,.json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const proj: Project = JSON.parse(text);
        xrefNativeJson = text;
        xrefNativeName = proj.name ?? file.name.replace(/\.(carpentra|json)$/i, '');
        xrefNativeFloorOptions = proj.floors.map((f, i) => ({ label: f.name ?? `Floor ${i}`, index: i }));
        xrefNativeFloorIndex = 0;
        xrefNativeDialog = true;
      } catch { alert('Invalid project file'); }
    };
    input.click();
  }

  function confirmLinkNative() {
    const xref: XRefNative = {
      id: uid(), name: xrefNativeName, type: 'native',
      position: { x: 0, y: 0 }, positionY: 0, rotation: 0, scale: 1, visible: true,
      sourceJson: xrefNativeJson, floorIndex: xrefNativeFloorIndex,
    };
    addXRef(xref);
    xrefNativeDialog = false; xrefNativeJson = '';
  }

  // Reactive XRef list from active floor
  let currentXrefs = $state<XRef[]>([]);
  activeFloor.subscribe(floor => { currentXrefs = floor?.xrefs ?? []; });

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
    if (!preset) return;
    if (get(viewMode) === '3d') {
      // In Design mode: hand off to ThreeViewer for active cursor placement
      placingRoomPresetId.set(presetId);
      placingRoomTemplateName.set(templateName ?? null);
    } else {
      // In Engineering mode: instant placement at camera center
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
    placingStairType.set('straight');
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

  // Wall finish panel state
  let wallFinishFace = $state<'interior' | 'exterior'>('interior');
  let wallFinishColor = $state<string | null>(null);
  let wallFinishTexture = $state<string | null>(null);

  function activateWallPaint(color: string | null, texture: string | null) {
    wallFinishColor = color;
    wallFinishTexture = texture;
    wallPaintColor.set(color);
    wallPaintTexture.set(texture);
    wallPaintFace.set(wallFinishFace);
  }

  function clearWallPaint() {
    wallFinishColor = null;
    wallFinishTexture = null;
    wallPaintColor.set(null);
    wallPaintTexture.set(null);
  }

  $effect(() => {
    wallPaintFace.set(wallFinishFace);
  });

  // Floor texture filename map (material id → /textures/floor-*.jpg)
  const floorTextures: Record<string, string> = {
    'light-oak': '/textures/floor-light-oak.jpg',
    'walnut': '/textures/floor-walnut.jpg',
    'bamboo': '/textures/floor-bamboo.jpg',
    'laminate': '/textures/floor-laminate.jpg',
    'ceramic-white': '/textures/floor-tile-white.jpg',
    'ceramic-gray': '/textures/floor-tile-gray.jpg',
    'porcelain': '/textures/floor-porcelain.jpg',
    'marble-white': '/textures/floor-marble-white.jpg',
    'marble-dark': '/textures/floor-marble-dark.jpg',
    'carpet-beige': '/textures/floor-carpet-beige.jpg',
    'carpet-gray': '/textures/floor-carpet-gray.jpg',
    'concrete': '/textures/floor-concrete.jpg',
    'slate': '/textures/floor-slate.jpg',
    'vinyl': '/textures/floor-vinyl.jpg',
  };

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
    <button
      class="flex-1 py-1.5 text-xs font-medium rounded transition-colors {activeTab === 'entourage' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}"
      onclick={() => activeTab = 'entourage'}
    >
      Entourage
    </button>
  </div>

  <div class="flex-1 overflow-y-auto p-3">
    {#if activeTab === 'draw'}
      <div class="space-y-0">

        <!-- ═══ ARCHITECTURE ═══ -->
        <button class="w-full flex items-center justify-between px-2 py-2.5 rounded-lg hover:bg-blue-50 group" onclick={() => archOpen = !archOpen}>
          <div class="flex items-center gap-2">
            <div class="w-1 h-4 rounded-full bg-blue-400 group-hover:bg-blue-500 transition-colors"></div>
            <span class="text-xs font-bold uppercase tracking-widest text-blue-600">Architecture</span>
          </div>
          <span class="text-blue-400 text-xs">{archOpen ? '▼' : '▶'}</span>
        </button>

        {#if archOpen}
        <div class="pl-3 space-y-0.5 border-l-2 border-blue-100 ml-2 mb-1">

        <!-- Wall Drawing -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => wallDrawOpen = !wallDrawOpen}>
          <span class="text-xs font-semibold text-gray-600">Walls</span>
          <span class="text-gray-400 text-xs">{wallDrawOpen ? '▼' : '▶'}</span>
        </button>
        {#if wallDrawOpen}
          <div class="pb-3 px-1 space-y-2">
            <div class="grid grid-cols-3 gap-1.5">
              <button
                onclick={() => { selectedTool.set('wall'); placingWallSubType.set('standard'); placingWallHeight.set(280); }}
                class="flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition-colors {$selectedTool === 'wall' && $placingWallSubType === 'standard' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}"
                title="Draw Wall (W)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/></svg>
                Wall
              </button>
              <button
                onclick={() => { selectedTool.set('wall'); placingWallSubType.set('half'); placingWallHeight.set(120); }}
                class="flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition-colors {$selectedTool === 'wall' && $placingWallSubType === 'half' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}"
                title="Half-Wall (120cm)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="18" height="11" rx="1"/><line x1="3" y1="10" x2="21" y2="10" stroke-dasharray="3 2"/></svg>
                Half-Wall
              </button>
              <button
                onclick={() => { selectedTool.set('wall'); placingWallSubType.set('curved'); placingWallHeight.set(280); }}
                class="flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition-colors {$selectedTool === 'wall' && $placingWallSubType === 'curved' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}"
                title="Curved Wall">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 Q12 4 20 20"/></svg>
                Curved
              </button>
            </div>
            <div class="flex items-center gap-2 px-1">
              <label class="text-[10px] text-gray-400 shrink-0">Height (cm)</label>
              <input type="number" min="30" max="600" step="10"
                value={$placingWallHeight}
                oninput={(e) => placingWallHeight.set(Number((e.target as HTMLInputElement).value))}
                class="flex-1 text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:border-blue-400" />
            </div>
          </div>
        {/if}

        <!-- 1. Wall Finish -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => wallOpen = !wallOpen}>
          <span class="text-xs font-semibold text-gray-600">Wall Finish</span>
          <span class="text-gray-400 text-xs">{wallOpen ? '▼' : '▶'}</span>
        </button>
        {#if wallOpen}
          <div class="pb-3 px-1 space-y-2.5">
            <!-- Active paint indicator + clear -->
            {#if wallFinishColor || wallFinishTexture}
              <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
                <div class="w-5 h-5 rounded border border-white shadow-sm shrink-0"
                  style={wallFinishTexture ? `background: url(/textures/${wallFinishTexture === 'brick' ? 'brick' : wallFinishTexture === 'stone' ? 'stone' : wallFinishTexture === 'wood-panel' ? 'wood-panel' : wallFinishTexture === 'concrete' ? 'concrete' : wallFinishTexture === 'tile' ? 'subway-tile' : 'brick'}.jpg) center/cover` : `background: ${wallFinishColor}`}
                ></div>
                <span class="text-xs text-blue-700 flex-1">Click walls to paint</span>
                <button class="text-blue-400 hover:text-blue-600 text-xs" onclick={clearWallPaint}>✕</button>
              </div>
            {:else}
              <p class="text-[10px] text-gray-400 px-1">Select a color or texture, then click a wall.</p>
            {/if}

            <!-- Color swatches -->
            <div>
              <p class="text-[10px] text-gray-400 mb-1.5 px-1">Colors</p>
              <div class="grid grid-cols-7 gap-1 px-1">
                {#each wallColors.filter(wc => !wc.texture) as wc}
                  <button
                    class="w-7 h-7 rounded-md border-2 transition-colors hover:scale-110 {wallFinishColor === wc.color && !wallFinishTexture ? 'border-blue-500 ring-1 ring-blue-200 scale-110' : 'border-gray-200 hover:border-gray-300'}"
                    style="background-color: {wc.color}"
                    title={wc.name}
                    onclick={() => activateWallPaint(wc.color, null)}
                  ></button>
                {/each}
              </div>
            </div>

            <!-- Texture swatches -->
            <div>
              <p class="text-[10px] text-gray-400 mb-1.5 px-1">Textures</p>
              <div class="grid grid-cols-3 gap-1.5 px-1">
                {#each wallColors.filter(wc => !!wc.texture) as wc}
                  {@const texFile = ({ 'red-brick': 'brick', 'exposed-brick': 'exposed-brick', 'stone': 'stone', 'wood-panel': 'wood-panel', 'concrete-block': 'concrete', 'subway-tile': 'subway-tile' })[wc.id] ?? ''}
                  <button
                    class="rounded-lg border-2 h-14 flex flex-col items-end justify-end overflow-hidden relative transition-all duration-150 hover:scale-[1.03] {wallFinishTexture === wc.id ? 'border-blue-500 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300'}"
                    style={texFile ? `background-image: url(/textures/${texFile}.jpg); background-size: cover; background-position: center` : `background-color: ${wc.color}30`}
                    title={wc.name}
                    onclick={() => activateWallPaint(wc.color, wc.id)}
                  >
                    <span class="bg-white/90 text-[9px] text-gray-900 px-1 py-0.5 rounded-tl leading-tight">{wc.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        <!-- 2. Flooring -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => flooringOpen = !flooringOpen}>
          <span class="text-xs font-semibold text-gray-600">Flooring</span>
          <span class="text-gray-400 text-xs">{flooringOpen ? '▼' : '▶'}</span>
        </button>
        {#if flooringOpen}
          <div class="pb-2 px-1">
            <p class="text-[10px] text-gray-400 mb-2 px-1">Select a room in 3D view, then pick a floor material.</p>
            <div class="grid grid-cols-3 gap-1.5 px-1">
              {#each floorMaterials as mat}
                {@const texPath = floorTextures[mat.id]}
                <button
                  class="rounded-lg border-2 border-gray-200 hover:border-blue-400 h-16 flex flex-col items-end justify-end overflow-hidden relative transition-all duration-150 hover:scale-[1.03]"
                  title={mat.name}
                  style={texPath ? `background-image: url(${texPath}); background-size: cover; background-position: center` : `background-color: ${mat.color}`}
                >
                  <span class="bg-white/90 text-[9px] text-gray-900 px-1 py-0.5 rounded-tl leading-tight w-full text-center">{mat.name}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- 3. Ceiling -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => ceilingOpen = !ceilingOpen}>
          <span class="text-xs font-semibold text-gray-600">Ceiling</span>
          <span class="text-gray-400 text-xs">{ceilingOpen ? '▼' : '▶'}</span>
        </button>
        {#if ceilingOpen}
          <div class="pb-2 px-2">
            <p class="text-xs text-gray-400 py-2">Ceiling height is set per-wall via wall properties.</p>
          </div>
        {/if}

        <!-- 4. Opening (Door + Window) -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => openingOpen = !openingOpen}>
          <span class="text-xs font-semibold text-gray-600">Opening</span>
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

        </div>{/if}<!-- /archOpen -->

        <!-- ═══ STRUCTURE ═══ -->
        <button class="w-full flex items-center justify-between px-2 py-2.5 rounded-lg hover:bg-amber-50 group" onclick={() => structOpen = !structOpen}>
          <div class="flex items-center gap-2">
            <div class="w-1 h-4 rounded-full bg-amber-400 group-hover:bg-amber-500 transition-colors"></div>
            <span class="text-xs font-bold uppercase tracking-widest text-amber-600">Structure</span>
          </div>
          <span class="text-amber-400 text-xs">{structOpen ? '▼' : '▶'}</span>
        </button>

        {#if structOpen}
        <div class="pl-3 space-y-0.5 border-l-2 border-amber-100 ml-2 mb-1">

        <!-- Staircase -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => structuresOpen = !structuresOpen}>
          <span class="text-xs font-semibold text-gray-600">Staircase</span>
          <span class="text-gray-400 text-xs">{structuresOpen ? '▼' : '▶'}</span>
        </button>
        {#if structuresOpen}
          <div class="space-y-1 pb-2">
            <div class="flex gap-2">
              <button
                class="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors {isPlacingStair ? 'bg-blue-50 text-slate-800 ring-1 ring-blue-200' : 'hover:bg-gray-50 text-gray-700'}"
                onclick={onPlaceStair}
              >
                <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 5h-5V2h-3v6h-4V5H7v6H2v3h5v3h3v-3h4v3h3v-6h5z"/></svg>
                </div>
                <div class="text-left">
                  <div class="font-medium text-xs">Staircase</div>
                  <div class="text-xs text-gray-400">Straight</div>
                </div>
              </button>
              <button
                class="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-gray-50 text-gray-700"
                onclick={() => { placingStairType.set('spiral'); placingStair.set(true); }}
              >
                <div class="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a9 9 0 0 1 9 9"/><path d="M12 6a6 6 0 0 1 6 6"/><path d="M12 9a3 3 0 0 1 3 3"/><circle cx="12" cy="21" r="1"/></svg>
                </div>
                <div class="text-left">
                  <div class="font-medium text-xs">Spiral Stair</div>
                  <div class="text-xs text-gray-400">Cylindrical</div>
                </div>
              </button>
            </div>
          </div>
        {/if}

        <!-- Column -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => columnsOpen = !columnsOpen}>
          <span class="text-xs font-semibold text-gray-600">Column</span>
          <span class="text-gray-400 text-xs">{columnsOpen ? '▼' : '▶'}</span>
        </button>
        {#if columnsOpen}
          <div class="space-y-1 pb-2">
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

        <!-- Post (stub) -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 opacity-50" title="Coming soon">
          <span class="text-xs font-semibold text-gray-500">Post</span>
          <span class="text-[10px] text-gray-300 bg-gray-100 px-1.5 rounded">soon</span>
        </button>

        <!-- Flooring Structure / Foundation (stub) -->
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 opacity-50" title="Coming soon">
          <span class="text-xs font-semibold text-gray-500">Foundation</span>
          <span class="text-[10px] text-gray-300 bg-gray-100 px-1.5 rounded">soon</span>
        </button>

        </div>{/if}<!-- /structOpen -->

        <!-- ═══ MEP ═══ -->
        <button class="w-full flex items-center justify-between px-2 py-2.5 rounded-lg hover:bg-emerald-50 group" onclick={() => mepOpen = !mepOpen}>
          <div class="flex items-center gap-2">
            <div class="w-1 h-4 rounded-full bg-emerald-400 group-hover:bg-emerald-500 transition-colors"></div>
            <span class="text-xs font-bold uppercase tracking-widest text-emerald-600">MEP</span>
          </div>
          <span class="text-emerald-400 text-xs">{mepOpen ? '▼' : '▶'}</span>
        </button>

        {#if mepOpen}
        <div class="pl-3 space-y-0.5 border-l-2 border-emerald-100 ml-2 mb-1">
          {#each ['Lighting', 'Clean Water', 'Waste Water', 'HVAC'] as mepItem}
            <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 opacity-50" title="Coming soon">
              <span class="text-xs font-semibold text-gray-500">{mepItem}</span>
              <span class="text-[10px] text-gray-300 bg-gray-100 px-1.5 rounded">soon</span>
            </button>
          {/each}
        </div>{/if}<!-- /mepOpen -->

        <!-- Room (outside AEC groups — layout tool) -->
        <div class="border-t border-gray-100 mt-1 pt-1">
        <button class="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50" onclick={() => roomOpen = !roomOpen}>
          <span class="text-xs font-semibold text-gray-600">Room presets</span>
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
        </div><!-- /room section -->

        <!-- ═══ CONSTRUCTION DETAILS ═══ -->
        <div class="border-t border-gray-100 mt-1 pt-1">
        <button class="w-full flex items-center justify-between px-2 py-2.5 rounded-lg hover:bg-violet-50 group" onclick={() => detailsOpen = !detailsOpen}>
          <div class="flex items-center gap-2">
            <div class="w-1 h-4 rounded-full bg-violet-400 group-hover:bg-violet-500 transition-colors"></div>
            <span class="text-xs font-bold uppercase tracking-widest text-violet-600">Details</span>
          </div>
          <span class="text-violet-400 text-xs">{detailsOpen ? '▼' : '▶'}</span>
        </button>

        {#if detailsOpen}
        <div class="pl-3 space-y-0.5 border-l-2 border-violet-100 ml-2 mb-1">
          {#if currentPlacingDetailId}
            <div class="flex items-center justify-between px-2 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-700 mb-1">
              <span>Click on a wall to place</span>
              <button onclick={() => placingDetailId.set(null)} class="text-violet-400 hover:text-violet-700 font-bold">✕</button>
            </div>
          {/if}
          {#each detailCategories as cat}
            <!-- Sub-group header -->
            <button class="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 mt-1"
              onclick={() => detailSubOpen[cat.label] = !detailSubOpen[cat.label]}>
              <span class="text-[10px] font-bold uppercase tracking-widest text-gray-500">{cat.label}</span>
              <span class="text-gray-400 text-[10px]">{detailSubOpen[cat.label] ? '▼' : '▶'}</span>
            </button>
            {#if detailSubOpen[cat.label]}
              {#each cat.subcategories as sub}
                {@const items = detailCatalog.filter(d => d.category === cat.label && d.subcategory === sub)}
                {#if items.length}
                  <p class="text-[9px] uppercase tracking-wider text-gray-400 px-2 pt-1.5">{sub}</p>
                  {#each items as detail}
                    <button
                      class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors {currentPlacingDetailId === detail.id ? 'bg-violet-50 border border-violet-300 text-violet-700' : 'hover:bg-gray-50 text-gray-700 border border-transparent'}"
                      onclick={() => { placingDetailId.set(currentPlacingDetailId === detail.id ? null : detail.id); }}
                    >
                      <!-- Layer color swatches (first 4) -->
                      <div class="flex gap-0.5 shrink-0">
                        {#each detail.layers.slice(0, 4) as l}
                          <div class="w-2.5 h-7 rounded-sm border border-black/10" style="background:{l.color}"></div>
                        {/each}
                      </div>
                      <div class="text-left min-w-0">
                        <div class="font-medium leading-tight truncate">{detail.name}</div>
                        <div class="text-[10px] text-gray-400 leading-tight">{detail.layers.length} layers · {detail.layers.reduce((s, l) => s + l.thickness, 0).toFixed(0)} cm</div>
                      </div>
                    </button>
                  {/each}
                {/if}
              {/each}
            {/if}
          {/each}
        </div>{/if}<!-- /detailsOpen -->
        </div><!-- /details section -->

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
    {:else if activeTab === 'entourage'}
      <div class="flex flex-col gap-2 py-2">

        <!-- Plan / Elevation filter -->
        <div class="flex gap-1 px-3">
          <button
            class="flex-1 py-1 text-xs rounded {entourageViewFilter === 'plan' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-slate-100 text-slate-500'}"
            onclick={() => entourageViewFilter = 'plan'}
          >Plan</button>
          <button
            disabled
            class="flex-1 py-1 text-xs rounded bg-slate-100 text-slate-500 opacity-40 cursor-not-allowed"
            title="Elevation view — available when elevation canvas ships"
          >Elevation</button>
        </div>

        <!-- Category accordions -->
        {#each entourageCategories as group}
          {@const visibleDefs = [
            ...entourageCatalog.filter(d => d.category === group.category && d.viewType === entourageViewFilter),
            ...$customEntourage.filter(d => d.category === group.category && d.viewType === entourageViewFilter),
          ]}
          {#if visibleDefs.length > 0}
            <div class="px-3">
              <button
                class="w-full flex items-center justify-between py-1 text-xs font-semibold text-slate-600 uppercase tracking-wide"
                onclick={() => entourageCategoryOpen[group.category] = !entourageCategoryOpen[group.category]}
              >
                {group.label}
                <span class="text-slate-400">{entourageCategoryOpen[group.category] ? '−' : '+'}</span>
              </button>
              {#if entourageCategoryOpen[group.category]}
                <div class="grid grid-cols-2 gap-2 mt-1 mb-2">
                  {#each visibleDefs as def}
                    <button
                      class="relative flex flex-col items-center gap-1 p-2 rounded border text-xs text-slate-600 transition-colors {currentPlacingEntourageId === def.id ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}"
                      onclick={() => {
                        placingEntourageDefId.set(currentPlacingEntourageId === def.id ? null : def.id);
                      }}
                      title={def.name}
                    >
                      <!-- Thumbnail -->
                      <div class="w-full h-10 flex items-center justify-center overflow-hidden">
                        {#if def.source === 'builtin'}
                          <svg viewBox={(def as EntourageDef).viewBox} class="max-w-full max-h-full" style="width:100%;height:40px">
                            <path d={(def as EntourageDef).svgPath} fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
                          </svg>
                        {:else}
                          <img src={(def as CustomEntourageDef).imageDataUrl} alt={def.name} class="max-w-full max-h-full object-contain" />
                        {/if}
                      </div>
                      <span class="text-center leading-tight line-clamp-2">{def.name}</span>
                      {#if def.source === 'custom'}
                        <span class="absolute top-1 right-1 text-[9px] bg-slate-200 text-slate-500 rounded px-1">custom</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/each}

        <!-- Upload custom -->
        <div class="px-3 pt-1 border-t border-slate-100 mt-1">
          <button
            class="w-full py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-dashed border-slate-300 hover:border-slate-400 rounded transition-colors"
            onclick={() => showEntourageUpload = true}
          >
            + Upload custom…
          </button>
        </div>

      </div>
    {/if}
  </div>
</div>

{#if showEntourageUpload}
  <EntourageUploadDialog
    onSave={(def: CustomEntourageDef) => { addCustomEntourage(def); showEntourageUpload = false; }}
    onClose={() => showEntourageUpload = false}
  />
{/if}

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

<!-- DXF XRef Link Dialog -->
{#if xrefDxfDialog}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onclick={() => xrefDxfDialog = false}>
    <div class="bg-white rounded-xl shadow-2xl w-80 p-5 space-y-3" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-sm font-bold text-gray-800">Link DXF File</h3>
      <label class="block">
        <span class="text-xs text-gray-500">Name</span>
        <input type="text" bind:value={xrefDxfName} class="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-500">Unit scale (DXF → cm)</span>
        <select bind:value={xrefDxfScale} class="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm">
          <option value={0.1}>Millimeters (×0.1)</option>
          <option value={1}>Centimeters (×1)</option>
          <option value={2.54}>Inches (×2.54)</option>
          <option value={100}>Meters (×100)</option>
        </select>
      </label>
      <div class="flex gap-2 pt-1">
        <button onclick={() => xrefDxfDialog = false} class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
        <button onclick={confirmLinkDxf} class="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors">Link</button>
      </div>
    </div>
  </div>
{/if}

<!-- Native .carpentra XRef Link Dialog -->
{#if xrefNativeDialog}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onclick={() => xrefNativeDialog = false}>
    <div class="bg-white rounded-xl shadow-2xl w-80 p-5 space-y-3" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-sm font-bold text-gray-800">Link .carpentra Project</h3>
      <label class="block">
        <span class="text-xs text-gray-500">Name</span>
        <input type="text" bind:value={xrefNativeName} class="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
      </label>
      {#if xrefNativeFloorOptions.length > 1}
        <label class="block">
          <span class="text-xs text-gray-500">Floor to reference</span>
          <select bind:value={xrefNativeFloorIndex} class="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm">
            {#each xrefNativeFloorOptions as opt}
              <option value={opt.index}>{opt.label}</option>
            {/each}
          </select>
        </label>
      {/if}
      <div class="flex gap-2 pt-1">
        <button onclick={() => xrefNativeDialog = false} class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
        <button onclick={confirmLinkNative} class="flex-1 px-3 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors">Link</button>
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
