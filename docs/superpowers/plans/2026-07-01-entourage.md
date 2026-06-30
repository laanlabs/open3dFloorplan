# 2D Entourage System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2D entourage system to the engineering (floor plan) canvas — 15 built-in CAD line-art symbols across people/vehicles/trees/landscaping, plus a custom PNG upload path.

**Architecture:** Entourage items are stored as `EntourageItem[]` on each `Floor` (same pattern as `wallDetailAttachments` and `textAnnotations`). Built-in symbols are authored as SVG path strings in `entourageCatalog.ts` and rendered via `Path2D` on the HTML5 canvas. A `placingEntourageDefId` writable in `project.ts` drives stamp-mode placement. The BuildPanel gains an Entourage tab with Plan/Elevation filter and per-category accordions.

**Tech Stack:** SvelteKit + Svelte 5 (runes), TypeScript, HTML5 Canvas 2D (`CanvasRenderingContext2D`, `Path2D`)

## Global Constraints

- Svelte 5 runes syntax only — use `$state`, `$derived`, `$props()`, `$effect`; no Svelte 4 `$:` reactive blocks
- All mutations call `mutate()` in `project.ts` (the undo/snapshot mechanism) — never mutate the project object in place
- Only plan-view items (`viewType === 'plan'`) render on the floor plan canvas; elevation items are stored but not rendered until the elevation canvas exists
- `npx tsc --noEmit` must pass with 0 new errors after each task
- The 6 pre-existing `svelte-check` errors in `BuildPanel.svelte` (`'annotate'`/`'measure'` not assignable to `Tool`) are known and harmless — do not fix or suppress them

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/utils/entourageCatalog.ts` | 15 built-in symbol definitions |
| Create | `src/lib/components/editor/EntourageUploadDialog.svelte` | PNG upload modal |
| Modify | `src/lib/models/types.ts` | New types: EntourageDef, CustomEntourageDef, EntourageItem; extend Floor + Project |
| Modify | `src/lib/stores/project.ts` | `placingEntourageDefId` store + 5 mutate actions |
| Modify | `src/lib/utils/canvasRenderer.ts` | `drawEntourageItems()`, `drawEntourageGhost()` |
| Modify | `src/lib/components/editor/FloorPlanCanvas.svelte` | Subscribe to store, render layer, placement + selection interaction |
| Modify | `src/lib/components/sidebar/BuildPanel.svelte` | Entourage tab, accordion, view filter |

---

## Task 1: Types

**Files:**
- Modify: `src/lib/models/types.ts`

**Interfaces:**
- Produces: `EntourageCategory`, `EntourageViewType`, `EntourageSource`, `EntourageDef`, `CustomEntourageDef`, `EntourageItem` — all used by every subsequent task

- [ ] **Step 1: Add entourage types after the `// ─── Construction Detail Library` block**

Open `src/lib/models/types.ts`. After line 167 (after `TextAnnotation`), add before `GuideLine`:

```typescript
// ─── Entourage Library ────────────────────────────────────────────────────────

export type EntourageCategory = 'people' | 'vehicles' | 'trees' | 'landscaping';
export type EntourageViewType = 'plan' | 'elevation';
export type EntourageSource = 'builtin' | 'custom';

export interface EntourageDef {
  id: string;
  name: string;
  category: EntourageCategory;
  viewType: EntourageViewType;
  source: 'builtin';
  svgPath: string;        // SVG path `d` string — rendered via Path2D
  viewBox: string;        // e.g. "0 0 200 85" — nominal width × height
  defaultWidthCm: number; // real-world width for auto-scale on first placement
}

export interface CustomEntourageDef {
  id: string;
  name: string;
  category: EntourageCategory;
  viewType: EntourageViewType;
  source: 'custom';
  imageDataUrl: string;   // base64 PNG data URL
  defaultWidthCm: number; // user-specified at upload time
  viewBox: string;        // "0 0 {naturalWidth} {naturalHeight}" set at upload
}

export interface EntourageItem {
  id: string;
  defId: string;
  source: EntourageSource;
  viewType: EntourageViewType;
  // Plan-view coords (floor plan cm units, same coordinate space as walls)
  x: number;
  y: number;
  // Elevation-view coords — populated when placed in elevation canvas (not used yet)
  elevationFaceId?: string;  // wall id of the viewed facade
  elevationX?: number;       // horizontal position along facade (cm)
  widthCm: number;
  rotation: number;          // degrees; applied in plan view; elevation items don't rotate
  opacity: number;           // 0–1, default 0.85
  locked: boolean;
}
```

- [ ] **Step 2: Extend `Floor` and `Project`**

In `types.ts`, find the `Floor` interface (around line 228). Add `entourageItems` as the last field before the closing brace:

```typescript
export interface Floor {
  // ... existing fields unchanged ...
  xrefs?: XRef[];
  entourageItems?: EntourageItem[];  // ← add this
}
```

Find the `Project` interface (around line 298). Add `customEntourage` before the closing brace:

```typescript
export interface Project {
  // ... existing fields unchanged ...
  sheets?: SheetPage[];
  customEntourage?: CustomEntourageDef[];  // ← add this
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors (or the same pre-existing count as before this change).

- [ ] **Step 4: Commit**

```bash
git add src/lib/models/types.ts
git commit -m "feat(entourage): add EntourageDef, CustomEntourageDef, EntourageItem types"
```

---

## Task 2: Built-in Catalog

**Files:**
- Create: `src/lib/utils/entourageCatalog.ts`

**Interfaces:**
- Consumes: `EntourageDef`, `EntourageCategory` from `$lib/models/types`
- Produces: `entourageCatalog: EntourageDef[]`, `entourageCategories` — consumed by BuildPanel and canvasRenderer

All paths are authored at the nominal units specified in `viewBox`. The canvas renderer scales them to real-world `widthCm` at render time.

- [ ] **Step 1: Create the catalog file**

Create `src/lib/utils/entourageCatalog.ts`:

```typescript
import type { EntourageDef, EntourageCategory } from '$lib/models/types';

export const entourageCatalog: EntourageDef[] = [

  // ── People (elevation only) ────────────────────────────────────────────────
  {
    id: 'person-standing',
    name: 'Standing Adult',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 30×170 nominal — head circle (r=12) + torso + legs
    svgPath: [
      'M 15,12 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',  // head
      'M 15,24 L 15,100',          // spine
      'M 4,50 L 15,70 L 26,50',   // arms
      'M 15,100 L 4,170',          // left leg
      'M 15,100 L 26,170',         // right leg
    ].join(' '),
    viewBox: '0 0 30 170',
    defaultWidthCm: 50,
  },
  {
    id: 'person-walking',
    name: 'Walking Adult',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 40×170 nominal — striding posture
    svgPath: [
      'M 18,12 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',
      'M 18,24 L 20,100',
      'M 5,48 L 18,68 L 32,44',
      'M 20,100 L 6,170',
      'M 20,100 L 34,170',
    ].join(' '),
    viewBox: '0 0 40 170',
    defaultWidthCm: 55,
  },
  {
    id: 'person-seated',
    name: 'Seated Person',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 60×100 nominal — seated in chair
    svgPath: [
      'M 30,12 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',  // head
      'M 30,24 L 30,65',           // torso
      'M 16,48 L 30,60 L 44,48',  // arms
      'M 10,65 L 55,65',          // seat line
      'M 10,65 L 10,100',         // near leg
      'M 55,65 L 55,100',         // far leg
    ].join(' '),
    viewBox: '0 0 60 100',
    defaultWidthCm: 60,
  },
  {
    id: 'person-child',
    name: 'Child',
    category: 'people',
    viewType: 'elevation',
    source: 'builtin',
    // 24×120 nominal — shorter proportions
    svgPath: [
      'M 12,10 m -10,0 a 10,10 0 1 0 20,0 a 10,10 0 1 0 -20,0',
      'M 12,20 L 12,75',
      'M 3,40 L 12,55 L 21,40',
      'M 12,75 L 3,120',
      'M 12,75 L 21,120',
    ].join(' '),
    viewBox: '0 0 24 120',
    defaultWidthCm: 35,
  },

  // ── Vehicles — plan (top-down) ────────────────────────────────────────────
  {
    id: 'vehicle-sedan-plan',
    name: 'Sedan (Plan)',
    category: 'vehicles',
    viewType: 'plan',
    source: 'builtin',
    // 200×85 nominal: body + windshields + wheel circles
    svgPath: [
      // Body outline
      'M 22,0 L 178,0 Q 200,0 200,22 L 200,63 Q 200,85 178,85 L 22,85 Q 0,85 0,63 L 0,22 Q 0,0 22,0 Z',
      // Roof outline (inner box)
      'M 58,0 L 142,0 L 142,85 L 58,85',
      // Front windshield
      'M 152,8 L 194,8 L 194,36 L 152,36',
      // Rear windshield
      'M 6,8 L 48,8 L 48,36 L 6,36',
      // Front-right wheel
      'M 168,4 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
      // Front-left wheel
      'M 168,68 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
      // Rear-right wheel
      'M 32,4 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
      // Rear-left wheel
      'M 32,68 m -14,0 a 14,14 0 1 0 28,0 a 14,14 0 1 0 -28,0',
    ].join(' '),
    viewBox: '0 0 200 85',
    defaultWidthCm: 450,
  },
  {
    id: 'vehicle-suv-plan',
    name: 'SUV (Plan)',
    category: 'vehicles',
    viewType: 'plan',
    source: 'builtin',
    // 210×95 nominal: wider/taller than sedan
    svgPath: [
      'M 24,0 L 186,0 Q 210,0 210,24 L 210,71 Q 210,95 186,95 L 24,95 Q 0,95 0,71 L 0,24 Q 0,0 24,0 Z',
      'M 62,0 L 148,0 L 148,95 L 62,95',
      'M 154,8 L 204,8 L 204,42 L 154,42',
      'M 6,8 L 56,8 L 56,42 L 6,42',
      'M 174,4 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
      'M 174,76 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
      'M 36,4 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
      'M 36,76 m -16,0 a 16,16 0 1 0 32,0 a 16,16 0 1 0 -32,0',
    ].join(' '),
    viewBox: '0 0 210 95',
    defaultWidthCm: 480,
  },
  {
    id: 'vehicle-bicycle-plan',
    name: 'Bicycle (Plan)',
    category: 'vehicles',
    viewType: 'plan',
    source: 'builtin',
    // 80×20 nominal: two wheel circles + frame
    svgPath: [
      // Rear wheel
      'M 14,10 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',
      // Front wheel
      'M 66,10 m -12,0 a 12,12 0 1 0 24,0 a 12,12 0 1 0 -24,0',
      // Frame (chain stay + top tube)
      'M 14,10 L 40,4 L 66,10',
      'M 40,4 L 40,16 L 14,10',
    ].join(' '),
    viewBox: '0 0 80 20',
    defaultWidthCm: 175,
  },

  // ── Vehicles — elevation (side view) ──────────────────────────────────────
  {
    id: 'vehicle-sedan-elevation',
    name: 'Sedan (Elevation)',
    category: 'vehicles',
    viewType: 'elevation',
    source: 'builtin',
    // 200×70 nominal: side profile
    svgPath: [
      // Body
      'M 18,40 Q 18,20 30,20 L 70,8 L 130,8 L 155,20 L 182,20 Q 198,20 198,40 L 198,56 Q 198,65 188,65 L 40,65 Q 28,65 28,56 Z',
      // Window
      'M 72,12 L 75,22 L 128,22 L 130,12 Z',
      // B-pillar
      'M 100,12 L 100,22',
      // Front wheel
      'M 155,65 m -22,0 a 22,22 0 1 0 44,0 a 22,22 0 1 0 -44,0',
      // Rear wheel
      'M 45,65 m -22,0 a 22,22 0 1 0 44,0 a 22,22 0 1 0 -44,0',
    ].join(' '),
    viewBox: '0 0 200 90',
    defaultWidthCm: 450,
  },
  {
    id: 'vehicle-suv-elevation',
    name: 'SUV (Elevation)',
    category: 'vehicles',
    viewType: 'elevation',
    source: 'builtin',
    // 210×80 nominal: higher roofline
    svgPath: [
      'M 20,45 Q 20,10 35,10 L 75,4 L 140,4 L 162,10 L 188,14 Q 206,14 206,45 L 206,62 Q 206,75 192,75 L 38,75 Q 24,75 24,62 Z',
      'M 76,6 L 78,18 L 140,18 L 142,6 Z',
      'M 105,6 L 105,18',
      'M 162,75 m -24,0 a 24,24 0 1 0 48,0 a 24,24 0 1 0 -48,0',
      'M 46,75 m -24,0 a 24,24 0 1 0 48,0 a 24,24 0 1 0 -48,0',
    ].join(' '),
    viewBox: '0 0 210 100',
    defaultWidthCm: 480,
  },

  // ── Trees (plan) ──────────────────────────────────────────────────────────
  {
    id: 'tree-deciduous-plan',
    name: 'Deciduous Tree',
    category: 'trees',
    viewType: 'plan',
    source: 'builtin',
    // 100×100 nominal: irregular organic circle + trunk cross
    svgPath: [
      'M 50,3 C 68,1 90,16 95,40 C 100,64 84,92 60,97 C 36,102 10,86 5,62 C 0,38 14,8 38,3 C 42,2 46,3 50,3 Z',
      // Trunk cross
      'M 44,50 L 56,50 M 50,44 L 50,56',
    ].join(' '),
    viewBox: '0 0 100 100',
    defaultWidthCm: 400,
  },
  {
    id: 'tree-conifer-plan',
    name: 'Conifer',
    category: 'trees',
    viewType: 'plan',
    source: 'builtin',
    // 80×80 nominal: starburst representing top-down conifer
    svgPath: [
      'M 40,2 L 43,26 L 58,10 L 48,32 L 72,28 L 54,44 L 74,58 L 50,56 L 52,80 L 40,64 L 28,80 L 30,56 L 6,58 L 26,44 L 8,28 L 32,32 L 22,10 L 37,26 Z',
      'M 40,2 L 40,78',
    ].join(' '),
    viewBox: '0 0 80 80',
    defaultWidthCm: 200,
  },
  {
    id: 'tree-palm-plan',
    name: 'Palm',
    category: 'trees',
    viewType: 'plan',
    source: 'builtin',
    // 80×80 nominal: radiating fronds from center
    svgPath: [
      // Center trunk
      'M 40,36 m -5,0 a 5,5 0 1 0 10,0 a 5,5 0 1 0 -10,0',
      // 8 fronds radiating outward
      'M 40,40 Q 50,25 60,10',
      'M 40,40 Q 58,32 76,24',
      'M 40,40 Q 60,44 78,48',
      'M 40,40 Q 54,58 62,74',
      'M 40,40 Q 40,62 40,80',
      'M 40,40 Q 26,58 18,74',
      'M 40,40 Q 20,44 2,48',
      'M 40,40 Q 22,32 4,24',
      'M 40,40 Q 30,25 20,10',
    ].join(' '),
    viewBox: '0 0 80 80',
    defaultWidthCm: 150,
  },

  // ── Landscaping (plan) ────────────────────────────────────────────────────
  {
    id: 'landscaping-shrub-plan',
    name: 'Shrub Mass',
    category: 'landscaping',
    viewType: 'plan',
    source: 'builtin',
    // 100×60 nominal: irregular blob
    svgPath: 'M 50,4 C 70,0 95,10 97,28 C 99,46 80,58 58,58 C 42,58 20,56 10,44 C 0,32 8,12 28,6 C 36,4 44,6 50,4 Z',
    viewBox: '0 0 100 60',
    defaultWidthCm: 200,
  },
  {
    id: 'landscaping-hedge-plan',
    name: 'Hedge Strip',
    category: 'landscaping',
    viewType: 'plan',
    source: 'builtin',
    // 150×40 nominal: rectangle with bumpy top/bottom edge
    svgPath: [
      // Top bumpy edge
      'M 0,20 C 0,10 12,0 20,8 C 28,16 32,2 45,6 C 58,10 62,0 75,4 C 88,8 92,2 105,8 C 118,14 122,2 135,6 C 148,10 150,14 150,20',
      // Bottom bumpy edge
      'L 150,20 C 150,26 138,40 128,32 C 118,24 114,38 100,34 C 86,30 82,40 68,36 C 54,32 50,40 36,34 C 22,28 18,40 8,34 C 4,32 0,28 0,20 Z',
    ].join(' '),
    viewBox: '0 0 150 40',
    defaultWidthCm: 300,
  },
  {
    id: 'landscaping-planter-plan',
    name: 'Planter Box',
    category: 'landscaping',
    viewType: 'plan',
    source: 'builtin',
    // 80×50 nominal: rectangle with inner soil indication
    svgPath: [
      'M 0,0 L 80,0 L 80,50 L 0,50 Z',         // outer box
      'M 6,6 L 74,6 L 74,44 L 6,44 Z',          // inner ledge
      // Diagonal soil texture lines
      'M 6,20 L 20,6 M 6,36 L 36,6 M 6,44 L 50,6 M 20,44 L 74,6 M 44,44 L 74,14 M 64,44 L 74,28',
    ].join(' '),
    viewBox: '0 0 80 50',
    defaultWidthCm: 120,
  },
];

// ── Category hierarchy for accordion UI ───────────────────────────────────────

export interface EntourageSubcategory {
  label: string;
  ids: string[];
}

export interface EntourageCategoryGroup {
  category: EntourageCategory;
  label: string;
  subcategories: EntourageSubcategory[];
}

export const entourageCategories: EntourageCategoryGroup[] = [
  {
    category: 'people',
    label: 'People',
    subcategories: [
      { label: 'Figures', ids: ['person-standing', 'person-walking', 'person-seated', 'person-child'] },
    ],
  },
  {
    category: 'vehicles',
    label: 'Vehicles',
    subcategories: [
      { label: 'Plan view', ids: ['vehicle-sedan-plan', 'vehicle-suv-plan', 'vehicle-bicycle-plan'] },
      { label: 'Elevation view', ids: ['vehicle-sedan-elevation', 'vehicle-suv-elevation'] },
    ],
  },
  {
    category: 'trees',
    label: 'Trees',
    subcategories: [
      { label: 'Plan view', ids: ['tree-deciduous-plan', 'tree-conifer-plan', 'tree-palm-plan'] },
    ],
  },
  {
    category: 'landscaping',
    label: 'Landscaping',
    subcategories: [
      { label: 'Plan view', ids: ['landscaping-shrub-plan', 'landscaping-hedge-plan', 'landscaping-planter-plan'] },
    ],
  },
];
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/entourageCatalog.ts
git commit -m "feat(entourage): add built-in entourage catalog (15 CAD symbols)"
```

---

## Task 3: Store Actions

**Files:**
- Modify: `src/lib/stores/project.ts`

**Interfaces:**
- Consumes: `EntourageItem`, `CustomEntourageDef` from `$lib/models/types`
- Produces: exported `placingEntourageDefId`, `addEntourageItem`, `updateEntourageItem`, `removeEntourageItem`, `addCustomEntourage`, `removeCustomEntourage` — consumed by BuildPanel and FloorPlanCanvas

- [ ] **Step 1: Add the placement store**

In `project.ts`, find the line:
```typescript
/** ID of ConstructionDetailDef being placed (null = not placing) */
export const placingDetailId = writable<string | null>(null);
```

Add immediately after it:

```typescript
/** ID of EntourageDef (builtin) or CustomEntourageDef being placed (null = not placing) */
export const placingEntourageDefId = writable<string | null>(null);
```

- [ ] **Step 2: Add mutate actions**

In `project.ts`, find the section with `addWallDetailAttachment` (near the end of the file). Add after it:

```typescript
export function addEntourageItem(item: import('$lib/models/types').EntourageItem): void {
  mutate((f) => {
    if (!f.entourageItems) f.entourageItems = [];
    f.entourageItems.push(item);
  }, 'Added entourage');
}

export function updateEntourageItem(
  itemId: string,
  patch: Partial<import('$lib/models/types').EntourageItem>
): void {
  mutate((f) => {
    if (!f.entourageItems) return;
    const idx = f.entourageItems.findIndex((e) => e.id === itemId);
    if (idx === -1) return;
    f.entourageItems[idx] = { ...f.entourageItems[idx], ...patch };
  }, 'Updated entourage');
}

export function removeEntourageItem(itemId: string): void {
  mutate((f) => {
    if (!f.entourageItems) return;
    f.entourageItems = f.entourageItems.filter((e) => e.id !== itemId);
  }, 'Removed entourage');
}

export function addCustomEntourage(def: import('$lib/models/types').CustomEntourageDef): void {
  const p = get(currentProject);
  if (!p) return;
  snapshot('Added custom entourage');
  if (!p.customEntourage) p.customEntourage = [];
  p.customEntourage.push(def);
  p.updatedAt = new Date();
  currentProject.set({ ...p });
}

export function removeCustomEntourage(defId: string): void {
  const p = get(currentProject);
  if (!p) return;
  snapshot('Removed custom entourage');
  p.customEntourage = (p.customEntourage ?? []).filter((d) => d.id !== defId);
  p.updatedAt = new Date();
  currentProject.set({ ...p });
}
```

- [ ] **Step 3: Update the import line in FloorPlanCanvas.svelte (pre-wire)**

In `src/lib/components/editor/FloorPlanCanvas.svelte`, the large import line at line 3 ends with `placingDetailId, addWallDetailAttachment, removeWallDetailAttachment`. Extend it:

```typescript
// Find:
placingDetailId, addWallDetailAttachment, removeWallDetailAttachment } from '$lib/stores/project';
// Replace with:
placingDetailId, addWallDetailAttachment, removeWallDetailAttachment,
  placingEntourageDefId, addEntourageItem, updateEntourageItem, removeEntourageItem } from '$lib/stores/project';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/project.ts src/lib/components/editor/FloorPlanCanvas.svelte
git commit -m "feat(entourage): add placingEntourageDefId store and mutate actions"
```

---

## Task 4: Canvas Renderer Functions

**Files:**
- Modify: `src/lib/utils/canvasRenderer.ts`

**Interfaces:**
- Consumes: `CanvasState` from `$lib/utils/canvasInteraction`; `EntourageItem`, `EntourageDef`, `CustomEntourageDef` from `$lib/models/types`
- Produces: `drawEntourageItems(cs, floor, selectedItemId, imageCache)`, `drawEntourageGhost(cs, def, x, y, rotation, widthCm)` — called from `FloorPlanCanvas.svelte`

- [ ] **Step 1: Add imports to canvasRenderer.ts**

At the top of `src/lib/utils/canvasRenderer.ts`, extend the existing type import:

```typescript
// Find the existing import line:
import type { Point, Wall, Door, Window as Win, FurnitureItem, Stair, Column, Floor, Annotation, DrivenAnnotation, WallDetailAttachment } from '$lib/models/types';
// Replace with:
import type { Point, Wall, Door, Window as Win, FurnitureItem, Stair, Column, Floor, Annotation, DrivenAnnotation, WallDetailAttachment, EntourageItem, EntourageDef, CustomEntourageDef } from '$lib/models/types';
```

- [ ] **Step 2: Add the entourage rendering helpers**

At the very end of `canvasRenderer.ts` (after all existing functions), add:

```typescript
// ── Entourage rendering ─────────────────────────────────────────────────────

/**
 * Parse viewBox string "0 0 W H" into [x, y, w, h].
 */
function parseViewBox(viewBox: string): [number, number, number, number] {
  const parts = viewBox.split(' ').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 100, parts[3] ?? 100];
}

/**
 * Render a single entourage item onto the canvas.
 * @param imageCache  Map keyed by CustomEntourageDef.id → loaded HTMLImageElement (for PNG items)
 */
function renderEntourageItem(
  cs: CanvasState,
  item: EntourageItem,
  def: EntourageDef | CustomEntourageDef,
  selected: boolean,
  imageCache: Map<string, HTMLImageElement>
): void {
  const { ctx, zoom, camX, camY, width, height } = cs;
  const sx = (item.x - camX) * zoom + width / 2;
  const sy = (item.y - camY) * zoom + height / 2;

  const [, , nomW, nomH] = parseViewBox(def.viewBox);
  const scaleX = (item.widthCm * zoom) / nomW;
  const scaleY = scaleX; // proportional

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate((item.rotation * Math.PI) / 180);
  ctx.globalAlpha = item.opacity;

  if (def.source === 'builtin') {
    const path = new Path2D((def as EntourageDef).svgPath);
    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.translate(-nomW / 2, -nomH / 2);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5 / scaleX;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(path);
    ctx.restore();
  } else {
    const img = imageCache.get(def.id);
    if (img) {
      const w = item.widthCm * zoom;
      const h = w * (nomH / nomW);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
  }

  // Selection ring
  if (selected) {
    const hw = (item.widthCm * zoom) / 2 + 4;
    const hh = ((item.widthCm * zoom) * (nomH / nomW)) / 2 + 4;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
    ctx.setLineDash([]);

    // Resize handle (bottom-right corner)
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(hw - 5, hh - 5, 10, 10);
  }

  ctx.restore();
}

/**
 * Draw all plan-view entourage items for a floor.
 */
export function drawEntourageItems(
  cs: CanvasState,
  floor: Floor,
  selectedItemId: string | null,
  allDefs: (EntourageDef | CustomEntourageDef)[],
  imageCache: Map<string, HTMLImageElement>
): void {
  if (!floor.entourageItems) return;
  const defMap = new Map(allDefs.map((d) => [d.id, d]));

  for (const item of floor.entourageItems) {
    if (item.viewType !== 'plan') continue; // elevation items not rendered here
    const def = defMap.get(item.defId);
    if (!def) continue;
    renderEntourageItem(cs, item, def, item.id === selectedItemId, imageCache);
  }
}

/**
 * Draw the placement ghost (follows cursor during stamp mode).
 */
export function drawEntourageGhost(
  cs: CanvasState,
  def: EntourageDef | CustomEntourageDef,
  worldX: number,
  worldY: number,
  rotation: number,
  imageCache: Map<string, HTMLImageElement>
): void {
  const { ctx, zoom, camX, camY, width, height } = cs;
  const sx = (worldX - camX) * zoom + width / 2;
  const sy = (worldY - camY) * zoom + height / 2;
  const [, , nomW, nomH] = parseViewBox(def.viewBox);
  const scaleX = (def.defaultWidthCm * zoom) / nomW;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.globalAlpha = 0.5;

  if (def.source === 'builtin') {
    const path = new Path2D((def as EntourageDef).svgPath);
    ctx.save();
    ctx.scale(scaleX, scaleX);
    ctx.translate(-nomW / 2, -nomH / 2);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5 / scaleX;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(path);
    ctx.restore();
  } else {
    const img = imageCache.get(def.id);
    if (img) {
      const w = def.defaultWidthCm * zoom;
      const h = w * (nomH / nomW);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    }
  }

  ctx.restore();
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/canvasRenderer.ts
git commit -m "feat(entourage): add drawEntourageItems and drawEntourageGhost to canvasRenderer"
```

---

## Task 5: FloorPlanCanvas — Render + Placement Interaction

**Files:**
- Modify: `src/lib/components/editor/FloorPlanCanvas.svelte`

**Interfaces:**
- Consumes: `drawEntourageItems`, `drawEntourageGhost` from `$lib/utils/canvasRenderer`; `placingEntourageDefId`, `addEntourageItem`, `updateEntourageItem`, `removeEntourageItem` from `$lib/stores/project`; `entourageCatalog` from `$lib/utils/entourageCatalog`; `EntourageDef`, `CustomEntourageDef`, `EntourageItem`, `CustomEntourageDef` from `$lib/models/types`; `currentProject` (for `customEntourage`)

- [ ] **Step 1: Add imports**

In `FloorPlanCanvas.svelte`, add to the imports section (near the other utility imports):

```typescript
import { drawEntourageItems as _drawEntourageItems, drawEntourageGhost as _drawEntourageGhost } from '$lib/utils/canvasRenderer';
import { entourageCatalog } from '$lib/utils/entourageCatalog';
import type { EntourageDef, CustomEntourageDef, EntourageItem } from '$lib/models/types';
```

The `placingEntourageDefId, addEntourageItem, updateEntourageItem, removeEntourageItem` imports were already added in Task 3 Step 3.

- [ ] **Step 2: Add entourage state variables**

In the `<script>` block, after the detail callout placement state (around line 122–124), add:

```typescript
  // Entourage placement + interaction state
  let currentPlacingEntourageDefId: string | null = $state(null);
  placingEntourageDefId.subscribe(id => { currentPlacingEntourageDefId = id; });
  let selectedEntourageItemId: string | null = $state(null);
  let ghostEntourageRotation: number = $state(0);
  // Image cache for custom PNG entourage items
  const entourageImageCache = new Map<string, HTMLImageElement>();
  // Resize drag state for selected entourage item
  let draggingEntourageResize: { itemId: string; startMouseX: number; startMouseY: number; origWidthCm: number } | null = $state(null);
  // Drag-to-move state for selected entourage item
  let draggingEntourageMove: { itemId: string; offsetX: number; offsetY: number } | null = $state(null);
```

- [ ] **Step 3: Add a helper to get all entourage defs (builtin + custom)**

In the `<script>` block, after the state variables above, add a derived expression:

```typescript
  // All defs: built-in catalog + project's custom uploads
  const allEntourageDefs = $derived((): (EntourageDef | CustomEntourageDef)[] => {
    const custom = ($currentProject as import('$lib/models/types').Project | null)?.customEntourage ?? [];
    return [...entourageCatalog, ...custom];
  });
```

You'll also need to subscribe to `currentProject` — it's already subscribed at the top of the file as `let currentFloor: Floor | null = $state(null)` via `activeFloor.subscribe`. Add a direct project subscription for `customEntourage`:

```typescript
  let $currentProject: import('$lib/models/types').Project | null = $state(null);
  currentProject.subscribe(p => { $currentProject = p; markDirty(); });
```

- [ ] **Step 4: Preload custom PNG images when project changes**

Add an `$effect` in the `<script>` block:

```typescript
  $effect(() => {
    const custom = $currentProject?.customEntourage ?? [];
    for (const def of custom) {
      if (!entourageImageCache.has(def.id)) {
        const img = new Image();
        img.onload = () => markDirty();
        img.src = def.imageDataUrl;
        entourageImageCache.set(def.id, img);
      }
    }
  });
```

- [ ] **Step 5: Wire dirty flag for placement**

In the `draw()` function, find the dirty-flag block (around line 1206–1212):

```typescript
    if (wallStart || draggingFurnitureId || ... || currentPlacingId || isPlacingStair || isPlacingColumn || marqueeStart || isPanning) {
      canvasDirty = true;
    }
```

Add `|| currentPlacingEntourageDefId || draggingEntourageResize || draggingEntourageMove` to that condition.

- [ ] **Step 6: Add entourage rendering call in draw()**

In `draw()`, find:

```typescript
    if (floor) drawDetailCallouts(floor);
```

Add immediately before that line:

```typescript
    // Entourage layer (between furniture and detail callouts)
    if (floor) {
      _drawEntourageItems(getCS(), floor, selectedEntourageItemId, allEntourageDefs(), entourageImageCache);
    }
    // Entourage placement ghost
    if (currentPlacingEntourageDefId && mousePos) {
      const def = allEntourageDefs().find(d => d.id === currentPlacingEntourageDefId);
      if (def) {
        const snapped = { x: snap(mousePos.x), y: snap(mousePos.y) };
        _drawEntourageGhost(getCS(), def, snapped.x, snapped.y, ghostEntourageRotation, entourageImageCache);
      }
    }
```

- [ ] **Step 7: Handle mouse events for entourage**

**In the `mousedown` handler** — find the section that handles `currentPlacingDetailId` (around where detail callouts are placed on click). Add entourage placement handling. Find the block that starts `// Detail callout placement` and add before it:

```typescript
      // Entourage stamp placement
      if (currentPlacingEntourageDefId && !e.altKey) {
        const def = allEntourageDefs().find(d => d.id === currentPlacingEntourageDefId);
        if (def) {
          const wp = screenToWorld(e.offsetX, e.offsetY);
          const snapped = { x: snap(wp.x), y: snap(wp.y) };
          addEntourageItem({
            id: Math.random().toString(36).slice(2, 10),
            defId: def.id,
            source: def.source,
            viewType: def.viewType,
            x: snapped.x,
            y: snapped.y,
            widthCm: def.defaultWidthCm,
            rotation: ghostEntourageRotation,
            opacity: 0.85,
            locked: false,
          });
          markDirty();
          return; // stamp placed, stay in stamp mode
        }
      }
```

**Also in `mousedown`** — handle clicking an existing entourage item to select it, or start drag-move. Add after the entourage stamp block:

```typescript
      // Entourage item selection (in select mode)
      if (currentTool === 'select' && !currentPlacingEntourageDefId) {
        const floor = currentFloor;
        if (floor?.entourageItems) {
          const wp = screenToWorld(e.offsetX, e.offsetY);
          const defs = allEntourageDefs();
          for (let i = floor.entourageItems.length - 1; i >= 0; i--) {
            const item = floor.entourageItems[i];
            if (item.viewType !== 'plan') continue;
            if (item.locked) continue;
            const def = defs.find(d => d.id === item.defId);
            if (!def) continue;
            const [,,nomW, nomH] = def.viewBox.split(' ').map(Number);
            const hw = item.widthCm / 2;
            const hh = item.widthCm * (nomH / nomW) / 2;
            // Axis-aligned hit test (rotation not factored — acceptable for MVP)
            if (Math.abs(wp.x - item.x) <= hw + 5 && Math.abs(wp.y - item.y) <= hh + 5) {
              // Check for resize handle hit (bottom-right corner in screen space)
              const sp = { x: (item.x - camX) * zoom + width / 2, y: (item.y - camY) * zoom + height / 2 };
              const rhx = sp.x + (hw + 4) * zoom;  // approx screen x of handle
              const rhy = sp.y + (hh + 4) * zoom;
              if (Math.hypot(e.offsetX - rhx, e.offsetY - rhy) < 10) {
                draggingEntourageResize = { itemId: item.id, startMouseX: e.offsetX, startMouseY: e.offsetY, origWidthCm: item.widthCm };
              } else {
                draggingEntourageMove = { itemId: item.id, offsetX: wp.x - item.x, offsetY: wp.y - item.y };
              }
              selectedEntourageItemId = item.id;
              markDirty();
              return;
            }
          }
        }
        // Click on empty canvas clears entourage selection
        if (selectedEntourageItemId) {
          selectedEntourageItemId = null;
          markDirty();
        }
      }
```

- [ ] **Step 8: Handle mousemove for drag-move and resize**

In the `mousemove` handler, find where `draggingFurnitureId` is handled. Add after it:

```typescript
      if (draggingEntourageMove) {
        const wp = screenToWorld(e.offsetX, e.offsetY);
        const snapped = { x: snap(wp.x - draggingEntourageMove.offsetX), y: snap(wp.y - draggingEntourageMove.offsetY) };
        updateEntourageItem(draggingEntourageMove.itemId, { x: snapped.x, y: snapped.y });
        markDirty();
      }
      if (draggingEntourageResize) {
        const dx = e.offsetX - draggingEntourageResize.startMouseX;
        const newWidthCm = Math.max(10, draggingEntourageResize.origWidthCm + dx / zoom);
        updateEntourageItem(draggingEntourageResize.itemId, { widthCm: newWidthCm });
        markDirty();
      }
```

- [ ] **Step 9: Handle mouseup to clear drag states**

In the `mouseup` handler, add:

```typescript
      if (draggingEntourageMove) { draggingEntourageMove = null; }
      if (draggingEntourageResize) { draggingEntourageResize = null; }
```

- [ ] **Step 10: Handle R key for ghost rotation + Delete for selected item**

In the `keydown` handler (find `handleGlobalShortcut` call), add before it:

```typescript
      // Entourage R key rotates ghost 45°
      if (e.key === 'r' || e.key === 'R') {
        if (currentPlacingEntourageDefId) {
          ghostEntourageRotation = (ghostEntourageRotation + 45) % 360;
          markDirty();
          return;
        }
      }
      // ESC exits entourage stamp mode
      if (e.key === 'Escape' && currentPlacingEntourageDefId) {
        placingEntourageDefId.set(null);
        ghostEntourageRotation = 0;
        markDirty();
        return;
      }
      // Delete removes selected entourage item
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEntourageItemId) {
        removeEntourageItem(selectedEntourageItemId);
        selectedEntourageItemId = null;
        markDirty();
        return;
      }
```

- [ ] **Step 11: Add right-click context menu for entourage items**

In the `contextmenu` handler (find where `ctxMenuVisible` is set), add a check before the wall/furniture checks:

```typescript
      // Right-click on entourage item
      if (currentFloor?.entourageItems && currentTool === 'select') {
        const wp = screenToWorld(e.offsetX, e.offsetY);
        const defs = allEntourageDefs();
        for (let i = currentFloor.entourageItems.length - 1; i >= 0; i--) {
          const item = currentFloor.entourageItems[i];
          if (item.viewType !== 'plan') continue;
          const def = defs.find(d => d.id === item.defId);
          if (!def) continue;
          const [,,nomW, nomH] = def.viewBox.split(' ').map(Number);
          const hw = item.widthCm / 2;
          const hh = item.widthCm * (nomH / nomW) / 2;
          if (Math.abs(wp.x - item.x) <= hw + 5 && Math.abs(wp.y - item.y) <= hh + 5) {
            e.preventDefault();
            selectedEntourageItemId = item.id;
            ctxMenuTargetType = 'canvas'; // reuse canvas menu type to show Delete
            ctxMenuTargetId = item.id;
            ctxMenuVisible = true;
            ctxMenuX = e.offsetX;
            ctxMenuY = e.offsetY;
            markDirty();
            return;
          }
        }
      }
```

Then in the context menu component (or wherever Delete is dispatched from right-click), handle deleting entourage: the `ContextMenu` `on:delete` handler already calls `removeElement(ctxMenuTargetId)`. Add an entourage check there — find the `removeElement` call in the context menu handler and add:

```typescript
      // Check if the target is an entourage item
      if (currentFloor?.entourageItems?.some(e => e.id === ctxMenuTargetId)) {
        removeEntourageItem(ctxMenuTargetId!);
        selectedEntourageItemId = null;
        markDirty();
        return;
      }
```

- [ ] **Step 12: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 13: Commit**

```bash
git add src/lib/components/editor/FloorPlanCanvas.svelte
git commit -m "feat(entourage): wire entourage rendering and placement interaction in FloorPlanCanvas"
```

---

## Task 6: BuildPanel — Entourage Tab

**Files:**
- Modify: `src/lib/components/sidebar/BuildPanel.svelte`

**Interfaces:**
- Consumes: `placingEntourageDefId` from `$lib/stores/project`; `entourageCatalog`, `entourageCategories` from `$lib/utils/entourageCatalog`; `currentProject` for `customEntourage`
- Produces: UI for symbol selection, view filter, custom upload trigger

- [ ] **Step 1: Add imports**

At the top of `BuildPanel.svelte`, in the import list, add:

```typescript
  import { placingEntourageDefId, addCustomEntourage, removeCustomEntourage, currentProject } from '$lib/stores/project';
  import { entourageCatalog, entourageCategories } from '$lib/utils/entourageCatalog';
  import type { EntourageDef, CustomEntourageDef, EntourageViewType } from '$lib/models/types';
  import EntourageUploadDialog from '$lib/components/editor/EntourageUploadDialog.svelte';
```

- [ ] **Step 2: Add Entourage tab state**

After the existing `let activeTab = $state<'draw' | 'furniture'>('draw');` line, change its type:

```typescript
  let activeTab = $state<'draw' | 'furniture' | 'entourage'>('draw');
```

Add tab-specific state:

```typescript
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
```

- [ ] **Step 3: Add the Entourage tab button**

In the template, find the tab row buttons (where `activeTab === 'draw'` and `activeTab === 'furniture'` tabs are). Add after the furniture tab button:

```svelte
    <button
      class="flex-1 py-1.5 text-xs font-medium rounded transition-colors {activeTab === 'entourage' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}"
      onclick={() => activeTab = 'entourage'}
    >
      Entourage
    </button>
```

- [ ] **Step 4: Add the Entourage tab content panel**

In the template, find where `{#if activeTab === 'furniture'}` ... `{/if}` ends. Add after it:

```svelte
{#if activeTab === 'entourage'}
  <div class="flex flex-col gap-2 py-2">

    <!-- Plan / Elevation filter -->
    <div class="flex gap-1 px-3">
      <button
        class="flex-1 py-1 text-xs rounded {entourageViewFilter === 'plan' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-slate-100 text-slate-500'}"
        onclick={() => entourageViewFilter = 'plan'}
      >Plan</button>
      <button
        class="flex-1 py-1 text-xs rounded {entourageViewFilter === 'elevation' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-slate-100 text-slate-500'}"
        onclick={() => entourageViewFilter = 'elevation'}
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
                      <svg viewBox={def.viewBox} class="max-w-full max-h-full" style="width:100%;height:40px">
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

{#if showEntourageUpload}
  <EntourageUploadDialog
    onSave={(def) => { addCustomEntourage(def); showEntourageUpload = false; }}
    onClose={() => showEntourageUpload = false}
  />
{/if}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors beyond the 6 pre-existing `BuildPanel.svelte` errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/sidebar/BuildPanel.svelte
git commit -m "feat(entourage): add Entourage tab to BuildPanel with accordion and view filter"
```

---

## Task 7: EntourageUploadDialog

**Files:**
- Create: `src/lib/components/editor/EntourageUploadDialog.svelte`

**Interfaces:**
- Props: `onSave: (def: CustomEntourageDef) => void`, `onClose: () => void`
- Produces: a modal that accepts PNG file, metadata, and emits a `CustomEntourageDef` on save

- [ ] **Step 1: Create the dialog component**

Create `src/lib/components/editor/EntourageUploadDialog.svelte`:

```svelte
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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 new errors.

- [ ] **Step 3: Run Svelte-check**

```bash
npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -v "annotate\|measure"
```

Expected: 0 errors shown (the `annotate`/`measure` errors are filtered out as known pre-existing).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/editor/EntourageUploadDialog.svelte
git commit -m "feat(entourage): add EntourageUploadDialog for custom PNG uploads"
```

---

## Task 8: Integration Verification

**Files:** No code changes — verification only.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Navigate to the editor and switch to engineering (2D) mode.

- [ ] **Step 2: Verify Entourage tab appears**

Open the left sidebar (BuildPanel). Confirm a third tab labelled "Entourage" appears alongside Draw and Furniture. Click it — confirm the Plan/Elevation filter pills and category accordions render without console errors.

- [ ] **Step 3: Verify plan-view stamp placement**

With "Plan" selected in the filter, expand "Vehicles" and click "Sedan (Plan)". Confirm:
- The cursor shows a blue ghost sedan following the mouse at correct scale relative to walls
- R key rotates the ghost 45° per press
- Clicking places the sedan on the canvas — it renders as thin stroke lines, not a filled box
- Stamp mode continues — you can place multiple
- ESC exits stamp mode and the ghost disappears

- [ ] **Step 4: Verify item scale**

Draw a 450cm wall. Place a sedan. Confirm the sedan (defaultWidthCm = 450) is approximately the same length as the wall. If wildly off, verify the `scaleX = (item.widthCm * zoom) / nomW` calculation in `canvasRenderer.ts`.

- [ ] **Step 5: Verify selection and resize**

Switch to the select tool. Click a placed sedan — a blue dashed selection rectangle and a solid blue resize handle (bottom-right) appear. Drag the resize handle right — the sedan grows proportionally. Delete key removes the item.

- [ ] **Step 6: Verify people and trees appear in correct view filters**

Switch filter to "Elevation" — confirm People category now appears with Standing/Walking/Seated/Child. Switch back to "Plan" — People disappear. Vehicles shows only "Plan view" sub-group items.

- [ ] **Step 7: Verify custom PNG upload**

Click "Upload custom…". Upload a small PNG (any image). Fill in name, category, view, width. Click "Save to library". Confirm it appears in the correct accordion with a "custom" badge. Click it and place it on the canvas — it renders as an image.

- [ ] **Step 8: Verify sheets mode captures entourage**

Switch to Sheets mode. Add a sheet if none exists. Add a "2D Plan" viewport. Confirm — entourage items placed in engineering mode appear inside the viewport frame (the SheetsCanvas renders a preview of the floor plan that should include the entourage SVG layer).

*Note: SheetsCanvas currently shows a blue placeholder for 2D Plan viewports, not a live render. This is pre-existing. Entourage will appear when the sheets 2D-plan render is wired up.*

- [ ] **Step 9: Final type check**

```bash
npx tsc --noEmit && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -v "annotate\|measure"
```

Expected: 0 errors on tsc; 0 errors on svelte-check (beyond filtered pre-existing).

- [ ] **Step 10: Final commit**

```bash
git add -A
git commit -m "feat(entourage): 2D entourage system complete — 15 CAD symbols, custom PNG upload, stamp placement"
```

---

## Self-Review Checklist (pre-implementation)

**Spec coverage:**
- ✅ People (elevation only) — 4 figures in catalog
- ✅ Vehicles (plan + elevation) — sedan, SUV, bicycle plan; sedan, SUV elevation
- ✅ Trees (plan) — deciduous, conifer, palm
- ✅ Landscaping (plan) — shrub, hedge, planter
- ✅ CAD line art default style (Path2D stroke)
- ✅ Custom PNG upload with category/viewType/real-world width
- ✅ Stamp mode (click to place, stay in mode, ESC to exit)
- ✅ R key rotation in 45° increments
- ✅ Selection ring + proportional resize handle
- ✅ Delete key + right-click delete
- ✅ `viewType` field on `EntourageItem` — elevation ready when canvas arrives
- ✅ Plan/Elevation filter pill in BuildPanel (Elevation grayed until elevation canvas, but structurally present)
- ✅ Custom items show in same accordion with badge
- ✅ Grid snap on placement
- ✅ Opacity 0.85 default

**Placeholder scan:** None found.

**Type consistency:**
- `allEntourageDefs()` returns `(EntourageDef | CustomEntourageDef)[]` — both `drawEntourageItems` and `drawEntourageGhost` accept this union type ✅
- `addEntourageItem` takes `EntourageItem` (full object, not partial) — caller in FloorPlanCanvas constructs the full object ✅
- `updateEntourageItem(itemId, patch)` takes `Partial<EntourageItem>` ✅
- `entourageCatalog` entries all have `source: 'builtin'` literal — matches `EntourageDef.source` ✅
