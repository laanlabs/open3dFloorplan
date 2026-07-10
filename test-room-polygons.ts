/**
 * Test script: run RoomPlan fixtures through createProjectFromRoomPlan(),
 * detect rooms (same path the 2D editor uses), and validate each room's
 * polygon from getRoomPolygon(): signed area vs detected area,
 * self-intersection, duplicate points, and closure against the wall loop.
 * Run with: npx tsx test-room-polygons.ts
 */
import { createProjectFromRoomPlan, DEFAULT_ROOMPLAN_OPTIONS } from './src/lib/utils/roomplanImport.js';
import { detectRooms, getRoomPolygon } from './src/lib/utils/roomDetection.js';
import type { Point } from './src/lib/models/types.js';
import { readFileSync, existsSync } from 'fs';

const files = ['test-roomplan.json', 'static/test-roomplan-multiroom.json'].filter(f => existsSync(f));

function shoelace(pts: Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return sum / 2;
}

function segIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function selfIntersects(pts: Point[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // skip adjacent segments (share a vertex)
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

let failures = 0;

for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  const project = createProjectFromRoomPlan(data, 'Test', DEFAULT_ROOMPLAN_OPTIONS);
  const floor = project.floors[0];
  const rooms = detectRooms(floor.walls);
  console.log(`\n=== ${file}: ${floor.walls.length} walls, ${rooms.length} rooms detected ===`);

  for (const room of rooms) {
    const poly = getRoomPolygon(room, floor.walls);
    const polyArea = Math.abs(shoelace(poly)) / 10000; // cm² → m²
    const dupes = poly.filter((p, i) =>
      poly.some((q, j) => j !== i && Math.abs(p.x - q.x) < 1 && Math.abs(p.y - q.y) < 1)).length;
    const inter = poly.length >= 4 && selfIntersects(poly);
    const areaOk = Math.abs(polyArea - room.area) < Math.max(0.1, room.area * 0.02);
    // A closed loop of N boundary walls needs at least N vertices
    // (T-junction splits may legitimately add collinear points).
    const countOk = poly.length >= room.walls.length;
    const ok = poly.length >= 3 && !inter && areaOk && dupes === 0 && countOk;
    if (!ok) failures++;

    console.log(`\n${room.name}: detected area ${room.area} m², ${room.walls.length} walls`);
    console.log(`  polygon (${poly.length} pts): ${poly.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(' ')}`);
    console.log(`  polygon area: ${polyArea.toFixed(2)} m² ${areaOk ? 'OK' : `MISMATCH (expected ~${room.area})`}`);
    console.log(`  self-intersecting: ${inter ? 'YES (BAD)' : 'no'}   duplicate pts: ${dupes}   pts vs walls: ${poly.length}/${room.walls.length}${countOk ? '' : ' (INCOMPLETE LOOP)'}`);
    console.log(`  => ${ok ? 'PASS' : 'FAIL'}`);
  }
}

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' room polygon(s) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
