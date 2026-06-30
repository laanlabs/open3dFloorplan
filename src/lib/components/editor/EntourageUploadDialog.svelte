<script lang="ts">
  import type { CustomEntourageDef, EntourageCategory, EntourageViewType } from '$lib/models/types';

  const { onSave, onClose } = $props<{
    onSave: (def: CustomEntourageDef) => void;
    onClose: () => void;
  }>();

  let name = $state('');
  let category = $state<EntourageCategory>('people');
  let viewType = $state<EntourageViewType>('elevation');
  let defaultWidthCm = $state(50);
  let imageDataUrl = $state('');
  let naturalWidth = $state(0);
  let naturalHeight = $state(0);
  let error = $state('');

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      error = 'File too large (max 2 MB)';
      return;
    }
    if (!file.type.startsWith('image/')) {
      error = 'Only image files are supported';
      return;
    }
    error = '';
    const reader = new FileReader();
    reader.onload = () => {
      imageDataUrl = reader.result as string;
      if (!name) name = file.name.replace(/\.[^.]+$/, '');
      // Detect natural dimensions
      const img = new Image();
      img.onload = () => { naturalWidth = img.naturalWidth; naturalHeight = img.naturalHeight; };
      img.src = imageDataUrl;
    };
    reader.readAsDataURL(file);
  }

  function save() {
    if (!imageDataUrl) { error = 'Please upload an image'; return; }
    if (!name.trim()) { error = 'Name is required'; return; }
    if (defaultWidthCm <= 0) { error = 'Width must be positive'; return; }
    const def: CustomEntourageDef = {
      id: Math.random().toString(36).slice(2, 10),
      name: name.trim(),
      category,
      viewType,
      source: 'custom',
      imageDataUrl,
      defaultWidthCm,
      viewBox: `0 0 ${naturalWidth || 100} ${naturalHeight || 100}`,
    };
    onSave(def);
  }

  // Preview aspect ratio
  const previewHeight = $derived(
    naturalWidth > 0 ? Math.round(100 * (naturalHeight / naturalWidth)) : 100
  );
</script>

<!-- Modal backdrop -->
<div
  class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
  role="dialog"
  aria-modal="true"
  onkeydown={(e) => e.key === 'Escape' && onClose()}
>
  <div class="bg-white rounded-xl shadow-xl w-80 p-5 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-slate-700">Upload Custom Entourage</h3>
      <button class="text-slate-400 hover:text-slate-600 text-lg leading-none" onclick={onClose}>×</button>
    </div>

    <!-- File picker -->
    <label class="flex flex-col gap-1">
      <span class="text-xs text-slate-500">Image (PNG, max 2 MB)</span>
      <input type="file" accept="image/*" onchange={onFileChange} class="text-xs text-slate-600" />
    </label>

    <!-- Preview -->
    {#if imageDataUrl}
      <div class="border border-slate-200 rounded p-2 bg-slate-50 flex items-center justify-center" style="height: {Math.min(previewHeight, 120)}px">
        <img src={imageDataUrl} alt="Preview" class="max-w-full max-h-full object-contain" />
      </div>
    {/if}

    <!-- Name -->
    <label class="flex flex-col gap-1">
      <span class="text-xs text-slate-500">Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder="e.g. Company logo person"
        class="border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-blue-400"
      />
    </label>

    <!-- Category -->
    <label class="flex flex-col gap-1">
      <span class="text-xs text-slate-500">Category</span>
      <select bind:value={category} class="border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-blue-400">
        <option value="people">People</option>
        <option value="vehicles">Vehicles</option>
        <option value="trees">Trees</option>
        <option value="landscaping">Landscaping</option>
      </select>
    </label>

    <!-- View type -->
    <label class="flex flex-col gap-1">
      <span class="text-xs text-slate-500">View</span>
      <div class="flex gap-2">
        <label class="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
          <input type="radio" bind:group={viewType} value="plan" /> Plan
        </label>
        <label class="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
          <input type="radio" bind:group={viewType} value="elevation" /> Elevation
        </label>
      </div>
    </label>

    <!-- Real-world width -->
    <label class="flex flex-col gap-1">
      <span class="text-xs text-slate-500">Real-world width (cm)</span>
      <input
        type="number"
        bind:value={defaultWidthCm}
        min="1"
        max="50000"
        class="border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-blue-400"
      />
    </label>

    {#if error}
      <p class="text-xs text-red-500">{error}</p>
    {/if}

    <!-- Actions -->
    <div class="flex gap-2 justify-end">
      <button
        class="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
        onclick={onClose}
      >Cancel</button>
      <button
        class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        onclick={save}
      >Save to library</button>
    </div>
  </div>
</div>
