# Collab focus mode: immediate anchor + ghost/clay rewrite — design spec
_2026-07-03_

Supersedes the material-treatment portions of
[2026-06-30-collab-highlight-design.md](2026-06-30-collab-highlight-design.md).
That spec introduced the current wireframe-wall + coral-recolor-target approach,
which has since surfaced two problems in practice — this spec fixes both.

## Problem

1. **Delayed anchor** — the dim/highlight effect only fires when a user selects
   an *existing* comment in `CollabPanel`. Clicking an object to start a *new*
   comment only shows a thin click-outline (`setCollabOutline`); the rest of the
   scene stays fully lit until after the comment is posted and re-selected. This
   creates a disconnect between "I clicked this object" and "the app shows me
   this object is the one I'm commenting on."

2. **Wireframe noise** — `enterFocusMode` sets `material.wireframe = true` on all
   wall meshes while focused, exposing raw internal triangulation. Combined with
   `opacity: 0.30` on everything else, the scene reads as visual clutter instead
   of a clean "spotlight" on the commented object. Separately, the focused object
   itself is recolored solid coral, hiding its real material/texture — the
   opposite of "the object I'm looking at."

## Decision

- Unify the two trigger paths (new-comment click, existing-comment select) onto
  the single existing `highlightedCommentObjectId` store, so both flows drive
  the same `enterFocusMode` / `exitFocusMode` pair with no timing gap.
- Replace wireframe + opacity-only dimming with a **ghost/clay material swap**:
  non-focused objects become flat, monochrome, semi-transparent silhouettes with
  normal depth occlusion (no wireframe, no postprocessing). The focused object
  keeps its real material untouched and gets only a crisp edge-outline, no
  recolor.

Constraint carried over from user decisions during brainstorming: **no
postprocessing** (`EffectComposer`/`OutlinePass`) — this must stay a
material-property-only technique, and **normal depth occlusion** (not true
depth-ignoring X-ray) for ghosted objects.

---

## Design

### 1. Trigger unification — one store, two writers

`highlightedCommentObjectId` (in `src/lib/stores/collaboration.ts`) becomes the
single source of truth for "which object is currently in focus," written from:

- **`CollabPanel.svelte` `selectComment()`** (existing) — sets it when a user
  clicks an existing comment card.
- **`ThreeViewer.svelte`'s collab click handler** (~line 1073-1105, new) — the
  moment a raycast hit resolves `collabSelectedObjectId` for a *new* comment
  draft, also call `highlightedCommentObjectId.set(collabSelectedObjectId)`.
  This makes the existing ThreeViewer subscription (~line 4471) fire
  `enterFocusMode()` immediately — before any text is typed or posted.

Both writers funnel through the same existing subscription; no new store, no
duplicated dim/restore logic.

**Clearing the focus** (`highlightedCommentObjectId.set(null)` → existing
subscription calls `exitFocusMode()`):
- Draft canceled — Escape key, closing the comment input, or clicking empty
  space with no raycast hit while the draft input is open.
- Existing comment deselected in `CollabPanel` (unchanged behavior).
- `viewMode` changes away from `'collab'` (existing guard, unchanged).

**Re-targeting**: clicking a different object while the draft input is still
open just calls `.set()` again with the new id — the subscription's existing
enter/exit pairing handles restoring the old mesh and ghosting the new one.

**On submit**: the newly created comment's `objectId` is already the current
`highlightedCommentObjectId` value (same object), so posting the comment does
not need to touch focus state — it's already correct. `focusedCommentId` gets
set to the new comment's id so the panel shows it as the active thread, same as
selecting any other comment.

`commentText` param on `enterFocusMode` becomes optional — draft calls pass
nothing (no committed text yet); existing-comment calls pass the comment text
as today.

### 2. Ghost/clay material (replaces wireframe + per-property dimming)

Remove `material.wireframe = true` entirely. Replace the current in-place
property mutation (`mat.opacity = ...`, `mat.transparent = ...`) with a
**whole-material swap** to one shared, module-level material:

```ts
const GHOST_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x9ca3af, // Tailwind gray-400 — matches the app's existing gray scale (app.css)
  map: null,
  roughness: 1,
  metalness: 0,
  transparent: true,
  opacity: 0.35,
  depthWrite: true,
  depthTest: true,
});
```

For every non-focused mesh in scope (§4): save `mesh.material` (the original
reference, not its properties) into the existing `meshOriginalOpacity` map —
rename conceptually to "saved original material map" since it now stores
whole material references — then set `mesh.material = GHOST_MATERIAL`.

Why a whole-material swap instead of mutating properties in place:
- Automatically strips any texture map / painted wall color (`map: null`),
  which is what makes the result actually monochrome — a per-property opacity
  tweak leaves the original color/texture visible underneath.
- Avoids any risk of corrupting a material instance that might be shared
  across multiple meshes (walls can share material instances) — restore is
  just "put the saved reference back on this mesh," never a partial mutation.
- `depthWrite: true` on a transparent material means only the nearest ghosted
  surface renders per pixel at each screen location — farther ghosted geometry
  behind it is culled by the depth test rather than blending into a jumble.
  This is what gives "hidden lines removed, clean silhouette" without
  wireframe and without any extra render pass.

Restore in `exitFocusMode()`: reassign each mesh's saved original material
reference; drop the saved entries.

### 3. Focused object — outline only, no recolor

Delete the existing color/emissive override on the target
(`mat.color.copy(HIGHLIGHT_COLOR)`, `mat.emissive`, `mat.emissiveIntensity`) —
the target's real material (color, texture, paint) stays exactly as authored.

Keep the existing edge-outline mechanism as the sole "this is the one" signal:
reuse `setCollabOutline` (`EdgesGeometry` + `LineSegments`, `depthTest: false`)
in the existing brand coral `HIGHLIGHT_COLOR = '#cb674c'` — already crisp,
already cheap, already consistent with the app's branding-coherence pass.
`enterFocusMode` should call this same function rather than maintaining a
second outline code path; if inspection at implementation time shows
`enterFocusMode` currently builds its own separate outline/helper (the "outline
helpers" cleanup referenced in `exitFocusMode`), consolidate to one.

### 4. Object scope

| Category | Treatment |
|---|---|
| Walls, furniture, doors/windows, stairs, columns, roofs (not the focused object) | Ghost material (§2) |
| Floor plane, grid | **Untouched** — stays fully normal, preserves spatial orientation |
| Focused object | Untouched material + outline (§3) |
| Other floors in multi-floor exploded/stacked view | **Untouched** — keeps existing 0.35-opacity exploded-view convention; focus mode only touches the active floor's objects |

### 5. What is not changed

- Camera fly-to (`Box3.setFromObject` → zoom toward center) — unchanged.
- `preFocusCameraPos` / `preFocusTarget` save/restore — unchanged.
- `focusedCommentId` store semantics (which comment thread is expanded in the
  panel) — unchanged, just now also set at submit-time for new comments.
- No `EffectComposer` / `OutlinePass` / any postprocessing pass.
- No true depth-ignoring X-ray — ghosted objects still occlude normally.

---

## Affected files

| File | Change |
|---|---|
| `src/lib/components/viewer3d/ThreeViewer.svelte` | `enterFocusMode`, `exitFocusMode`, collab click handler (~1073-1105), possible consolidation of `setCollabOutline` |
| `src/lib/stores/collaboration.ts` | No new stores; `highlightedCommentObjectId` gains a second writer (documented above) |
| `src/lib/components/collaboration/CollabPanel.svelte` | No changes required — already writes `highlightedCommentObjectId` |

---

## Constants

```
HIGHLIGHT_COLOR      = '#cb674c'   // corporate coral — outline only now, not recolor
GHOST_COLOR          = '#9ca3af'   // Tailwind gray-400
GHOST_OPACITY        = 0.35
```

`DIM_OPACITY`, `HIGHLIGHT_EMISSIVE`, `HIGHLIGHT_EMISSIVE_I` from the prior spec
are removed — no longer used now that the target isn't recolored and
non-target dimming is a full material swap, not an opacity mutation.

---

## Out of scope

- Postprocessing-based outline glow (`OutlinePass`) — explicitly rejected for
  performance (must stay lightweight, per requirements).
- True X-ray (depth-test-disabled) rendering of the focused object.
- Ghosting the floor/grid or other floors in exploded view.
- Applying this treatment to the 2D canvas (`FloorPlanCanvas.svelte`).
- Animating the outline (pulse/breathe).
