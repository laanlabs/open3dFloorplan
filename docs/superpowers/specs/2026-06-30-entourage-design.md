# Spec: 2D Entourage System

**Date:** 2026-06-30
**Status:** Approved

---

## Context

The 2D engineering canvas (`FloorPlanCanvas.svelte`) has walls, doors, windows, stairs, columns, text annotations, and detail callouts — but no way to place human-scale context figures. Without entourage, engineering drawings lack scale reference and feel sterile.

**Key decisions:**
- Entourage lives in engineering mode as a floor-plan layer, not in Sheets mode. Sheets viewports capture the floor plan, so entourage appears in them automatically.
- Visual style: CAD line art (thin-stroke SVG paths) for built-in symbols, with an upload path for custom PNGs.
- Furniture is explicitly out of scope — it belongs to a future 3D↔2D linked library where every 2D symbol has a 3D counterpart.
- Elevation canvas is coming soon. The data model fully supports elevation placement; the rendering wires in when that canvas arrives.

---

## Categories & Symbols

| Symbol | Category | View | `defaultWidthCm` |
|---|---|---|---|
| Standing adult | people | elevation | 50 |
| Walking adult | people | elevation | 50 |
| Seated person | people | elevation | 60 |
| Child figure | people | elevation | 35 |
| Sedan (top) | vehicles | plan | 450 |
| SUV (top) | vehicles | plan | 480 |
| Sedan (side) | vehicles | elevation | 450 |
| SUV (side) | vehicles | elevation | 480 |
| Bicycle (top) | vehicles | plan | 175 |
| Deciduous canopy | trees | plan | 400 |
| Conifer circle | trees | plan | 200 |
| Palm plan | trees | plan | 150 |
| Shrub mass | landscaping | plan | 200 |
| Hedge strip | landscaping | plan | 300 |
| Planter box | landscaping | plan | 120 |

People appear in elevation only (no plan footprint). Vehicles have both views. Trees and landscaping are plan-only (canopy circles and shrub masses).

---

## Data Model (`src/lib/models/types.ts`)

```ts
type EntourageCategory = 'people' | 'vehicles' | 'trees' | 'landscaping'
type EntourageViewType = 'plan' | 'elevation'
type EntourageSource = 'builtin' | 'custom'

interface EntourageDef {
  id: string
  name: string
  category: EntourageCategory
  viewType: EntourageViewType
  source: 'builtin'
  svgPath: string        // SVG `d` attribute
  viewBox: string        // e.g. "0 0 450 200"
  defaultWidthCm: number
}

interface CustomEntourageDef {
  id: string
  name: string
  category: EntourageCategory
  viewType: EntourageViewType
  source: 'custom'
  imageDataUrl: string   // base64 PNG
  defaultWidthCm: number // user-specified at upload
}

interface EntourageItem {
  id: string
  defId: string
  source: EntourageSource
  viewType: EntourageViewType

  // Plan-view coords (floor plan cm units)
  x: number
  y: number

  // Elevation-view coords (populated when placed in elevation canvas)
  elevationFaceId?: string  // wall id of the face being viewed
  elevationX?: number       // horizontal position along face (cm)

  widthCm: number
  rotation: number          // degrees; plan only — elevation items don't rotate
  opacity: number           // 0–1, default 0.85
  locked: boolean
}
```

**`Floor` gains:** `entourageItems?: EntourageItem[]`

**`Project` gains:** `customEntourage?: CustomEntourageDef[]` — shared across floors, persists with project JSON.

---

## New File: `src/lib/utils/entourageCatalog.ts`

Mirrors `detailCatalog.ts`. Exports:
- `entourageCatalog: EntourageDef[]` — the 15 built-in symbols above
- `entourageCategories` — hierarchy for accordion grouping in the UI

SVG paths are hand-authored at 100-unit scale, parameterised via `viewBox`. Stroke weight is fixed at 1.5px in the canvas renderer (not baked into path data) so it stays crisp at any zoom level.

---

## Store Changes (`src/lib/stores/project.ts`)

New exported writables / actions:
- `placingEntourageDefId: Writable<string | null>` — active when user clicks a symbol in BuildPanel
- `addEntourageItem(floorId, item)` — push to `floor.entourageItems`, call `mutate()`
- `updateEntourageItem(floorId, itemId, patch)` — merge patch, call `mutate()`
- `removeEntourageItem(floorId, itemId)` — splice from array, call `mutate()`
- `addCustomEntourage(def)` — push to `project.customEntourage`, call `mutate()`
- `removeCustomEntourage(defId)` — remove from array, call `mutate()`

---

## UI: `src/lib/components/sidebar/BuildPanel.svelte`

New **Entourage** tab alongside the existing tool tabs.

Tab layout:
- **View filter pill** at top: `Plan | Elevation` — filters which symbols are shown (matches current canvas mode; Elevation is grayed out until elevation canvas ships)
- **Accordion** by category: People / Vehicles / Trees / Landscaping
- Each symbol: 40×40px SVG thumbnail (built-in renders inline path; custom shows PNG) + label
- Click → sets `placingEntourageDefId`; previously active placement tool is cleared
- **"Upload custom…" footer button** → opens `EntourageUploadDialog`
- Custom items appear under their category with a small upload-badge icon

---

## UI: `src/lib/components/editor/FloorPlanCanvas.svelte`

### Rendering layer (SVG overlay, plan-view items only)

```
walls + rooms
↓ [future] furniture footprints
↓ entourage   ← new
↓ detail callouts
↓ text annotations
↓ dimensions
```

Built-in: `<use href="#ent-{defId}">` referencing `<defs>` block of `<symbol>` elements  
Custom PNG: `<image href="{imageDataUrl}">` sized by `widthCm × canvasScale`

Only items with `viewType === 'plan'` render here. Elevation items are stored in the floor but invisible until the elevation canvas.

### Placement interaction

- `$placingEntourageDefId` set → canvas shows ghost SVG following cursor, scaled to `defaultWidthCm`
- Click → commits `addEntourageItem(...)` at cursor position; stamp mode stays active
- **R key** while ghost active → rotates ghost 45° (updates a local `ghostRotation` state, not committed until click)
- **ESC** → clears `placingEntourageDefId`, exits stamp mode
- Ghost respects grid snap (same `snap2D()` helper used by wall drawing)

### Selection & editing

- Click placed item → `selectedEntourageItemId` local state; shows:
  - Dashed selection ring
  - Corner resize handle (bottom-right) — drag scales `widthCm`, height follows aspect ratio
- Right-click placed item → inline popover with: **Delete**, **Lock/Unlock**, **Opacity** slider (0.3–1)
- Selected item: Delete key removes it

---

## New Component: `src/lib/components/editor/EntourageUploadDialog.svelte`

Modal dialog triggered from BuildPanel footer.

Fields:
- File picker (PNG only, max 2 MB; validated client-side)
- Name (text input)
- Category (dropdown: People / Vehicles / Trees / Landscaping)
- View type (Plan / Elevation)
- Real-world width in cm (number input, required for scale)
- PNG preview at entered scale relative to a 400cm reference wall

On save: calls `addCustomEntourage({ id: crypto.randomUUID(), source: 'custom', ... })` then closes.

---

## Elevation Canvas Integration (deferred)

When the elevation canvas is built it will:
1. Expose an `activeFaceId` store (the wall being viewed in elevation)
2. BuildPanel Entourage tab defaults to `Elevation` filter in that view
3. Placement writes `elevationFaceId` + `elevationX` instead of `x, y`
4. Elevation canvas renders `floor.entourageItems.filter(i => i.viewType === 'elevation' && i.elevationFaceId === activeFaceId)`

No stubs needed now — the data model is already ready.

---

## Verification

1. `npm run dev` → engineering mode → Entourage tab visible in BuildPanel
2. Click plan symbol (e.g. Sedan top) → ghost follows cursor on canvas at correct scale vs. walls
3. R key rotates ghost 45° increments
4. Click → item placed; stamp continues; ESC exits
5. Click placed item → selection ring + resize handle appears; drag scales proportionally
6. Right-click → Delete, Lock, Opacity popover work
7. Upload PNG custom item → appears in accordion under correct category with badge
8. Custom item can be placed with same ghost/click flow
9. Switch to Sheets → add 2D Plan viewport → entourage visible inside the viewport frame
10. `npx tsc --noEmit` → 0 new type errors
11. `npx svelte-check` → 0 new errors beyond the 6 known pre-existing ones
