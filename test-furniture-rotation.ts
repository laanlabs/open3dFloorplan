/**
 * Test script: verify furniture headings survive RoomPlan import.
 *
 * For every object in the raw RoomPlan JSON we compute its heading relative to
 * the nearest wall segment purely from the 3D transforms (ground-plane
 * projection of each local X axis — no importer code involved). Then we import
 * via createProjectFromRoomPlan() with (a) straighten+orthogonal ON (the
 * DEFAULT_ROOMPLAN_OPTIONS used by the ?import= handoff and dialog defaults)
 * and (b) both OFF, and check the furniture-vs-wall relative angle is
 * preserved (mod a small snapping tolerance for the ortho case).
 *
 * Also prints the error the legacy rotation formula (+atan2(t[8],t[0]), i.e.
 * the un-negated RoomPlan Y-rotation) would have produced, to document the
 * "every item tilted by 2× the scan tilt" bug.
 *
 * Run with: npx tsx test-furniture-rotation.ts
 *   (or bundle: npx esbuild test-furniture-rotation.ts --bundle --format=esm \
 *      --platform=node "--alias:\$lib=./src/lib" --outfile=/tmp/tfr.mjs && node /tmp/tfr.mjs)
 */
import { createProjectFromRoomPlan } from './src/lib/utils/roomplanImport.js';
import type { Wall, FurnitureItem, Point } from './src/lib/models/types.js';
import { readFileSync } from 'fs';

const FILE = 'test-roomplan.json';
const ORTHO_TOL = 6;    // deg — per-wall H/V snapping can shift a wall a few degrees
const EXACT_TOL = 0.01; // deg — with straighten/orthogonal off, nothing may move

function norm180(a: number): number {
  a = ((a % 360) + 360) % 360;
  return a >= 180 ? a - 360 : a;
}

function wallAngleDeg(w: { start: Point; end: Point }): number {
  return (Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180) / Math.PI;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const data = JSON.parse(readFileSync(FILE, 'utf-8'));

// ── Raw geometry, straight from the transforms (ground plane: x=rpX, y=rpZ, cm) ──
// Same validity filters as importRoomPlan so array indices line up with the import.
const rawWalls: { start: Point; end: Point }[] = [];
for (const rw of data.walls ?? []) {
  if (!rw.dimensions || rw.dimensions.length < 2 || !rw.transform || rw.transform.length < 16) continue;
  if (!isFinite(rw.dimensions[0]) || !isFinite(rw.dimensions[1])) continue;
  const t = rw.transform;
  const cx = t[12] * 100, cy = t[14] * 100;
  const half = (rw.dimensions[0] / 2) * 100;
  // Local X axis projected to ground plane = (t[0], t[2])
  rawWalls.push({
    start: { x: cx - t[0] * half, y: cy - t[2] * half },
    end: { x: cx + t[0] * half, y: cy + t[2] * half },
  });
}

const rawObjects: { pos: Point; headingDeg: number; legacyDeg: number; label: string }[] = [];
for (const ro of data.objects ?? []) {
  if (!ro.dimensions || ro.dimensions.length < 3 || !ro.transform || ro.transform.length < 16) continue;
  const t = ro.transform;
  const cat = ro.category;
  const label = typeof cat === 'string' ? cat : Object.keys(cat ?? {})[0] ?? '?';
  rawObjects.push({
    pos: { x: t[12] * 100, y: t[14] * 100 },
    headingDeg: (Math.atan2(t[2], t[0]) * 180) / Math.PI, // ground-plane angle of local X axis
    legacyDeg: (Math.atan2(t[8], t[0]) * 180) / Math.PI,  // old formula: raw Y-rotation (wrong sign in plan coords)
    label,
  });
}

// Nearest wall (by segment distance) per object, chosen once in raw coords
const nearestWallIdx = rawObjects.map(o => {
  let best = -1, bestD = Infinity;
  rawWalls.forEach((w, i) => {
    const d = distToSegment(o.pos, w.start, w.end);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
});

// ── Import both ways ──
const floorOn = createProjectFromRoomPlan(data, 'test-on').floors[0]; // DEFAULT_ROOMPLAN_OPTIONS
const floorOff = createProjectFromRoomPlan(data, 'test-off', { straighten: false, orthogonal: false }).floors[0];

if (floorOn.walls.length !== rawWalls.length || floorOn.furniture.length !== rawObjects.length) {
  console.error('Index mismatch between raw filter and importer — fix the test.');
  process.exit(1);
}

function relAngles(floor: { walls: Wall[]; furniture: FurnitureItem[] }): number[] {
  return floor.furniture.map((f, i) => norm180(f.rotation - wallAngleDeg(floor.walls[nearestWallIdx[i]])));
}

const relRaw = rawObjects.map((o, i) => norm180(o.headingDeg - wallAngleDeg(rawWalls[nearestWallIdx[i]])));
const relOn = relAngles(floorOn);
const relOff = relAngles(floorOff);

// Legacy (pre-fix) headings: OFF = raw Y-rotation as-is; ON = that plus the same
// global ortho rotation R the current code applies (R = fixed ON minus fixed OFF).
const legacyRelOff = rawObjects.map((o, i) => norm180(o.legacyDeg - wallAngleDeg(floorOff.walls[nearestWallIdx[i]])));
const legacyRelOn = rawObjects.map((o, i) => {
  const R = floorOn.furniture[i].rotation - floorOff.furniture[i].rotation;
  return norm180(o.legacyDeg + R - wallAngleDeg(floorOn.walls[nearestWallIdx[i]]));
});

let failures = 0;
const pad = (v: string | number, n: number) => String(v).padStart(n);
console.log(`=== ${FILE}: furniture heading vs nearest wall (degrees) ===`);
console.log(
  `${'object'.padEnd(10)} ${pad('raw rel', 8)} ${pad('off rel', 8)} ${pad('on rel', 8)} ` +
  `${pad('Δoff', 7)} ${pad('Δon', 7)} ${pad('legacyΔoff', 11)} ${pad('legacyΔon', 10)}  result`
);
rawObjects.forEach((o, i) => {
  const dOff = norm180(relOff[i] - relRaw[i]);
  const dOn = norm180(relOn[i] - relRaw[i]);
  const ldOff = norm180(legacyRelOff[i] - relRaw[i]);
  const ldOn = norm180(legacyRelOn[i] - relRaw[i]);
  const ok = Math.abs(dOff) <= EXACT_TOL && Math.abs(dOn) <= ORTHO_TOL;
  if (!ok) failures++;
  console.log(
    `${o.label.padEnd(10)} ${pad(relRaw[i].toFixed(2), 8)} ${pad(relOff[i].toFixed(2), 8)} ${pad(relOn[i].toFixed(2), 8)} ` +
    `${pad(dOff.toFixed(2), 7)} ${pad(dOn.toFixed(2), 7)} ${pad(ldOff.toFixed(2), 11)} ${pad(ldOn.toFixed(2), 10)}  ${ok ? '✅' : '❌'}`
  );
});

// Doors/windows carry no independent rotation — they are parametric (0..1) along
// their parent wall, so wall transforms carry them. Sanity-check that invariant.
let dwFail = 0;
for (const floor of [floorOn, floorOff]) {
  for (const d of [...floor.doors, ...floor.windows]) {
    const wall = floor.walls.find(w => w.id === d.wallId);
    if (!wall || !(d.position > 0 && d.position < 1)) dwFail++;
  }
}
console.log(`\nDoors/windows: parametric position on a valid parent wall in both imports: ${dwFail === 0 ? '✅' : `❌ (${dwFail} bad)`}`);
failures += dwFail;

console.log(failures === 0 ? '\n✅ PASS — relative furniture headings preserved' : `\n❌ FAIL — ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
