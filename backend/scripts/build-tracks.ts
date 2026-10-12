// One-off: snap every station-to-station link onto real OpenStreetMap track.
// Input:  data/raw/osm-rail.json (from fetch-osm.mjs) + live TfL station links.
// Output: data/tracks.json  { "stationA|stationB": [[lon, lat], ...] }  (A < B, oriented A -> B)
import { readFileSync, writeFileSync } from "node:fs";
import { distance } from "../src/geo.js";
import { loadAllLines, type LngLat } from "../src/lines.js";

interface Way { geometry: { lat: number; lon: number }[] }

const raw = JSON.parse(readFileSync("data/raw/osm-rail.json", "utf8")) as { elements: Way[] };

// ---- graph: nodes are shared where two ways have the same coordinate ----
const ids = new Map<string, number>();
const coords: LngLat[] = [];
const adj: [number, number][][] = [];
const nodeId = (lon: number, lat: number) => {
  const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
  let id = ids.get(key);
  if (id === undefined) {
    id = coords.length;
    ids.set(key, id);
    coords.push([lon, lat]);
    adj.push([]);
  }
  return id;
};
for (const w of raw.elements) {
  if (!w.geometry) continue;
  for (let i = 1; i < w.geometry.length; i++) {
    const a = nodeId(w.geometry[i - 1].lon, w.geometry[i - 1].lat);
    const b = nodeId(w.geometry[i].lon, w.geometry[i].lat);
    if (a === b) continue;
    const d = distance(coords[a], coords[b]);
    adj[a].push([b, d]);
    adj[b].push([a, d]);
  }
}
console.log(`graph: ${coords.length} nodes from ${raw.elements.length} ways`);

// ---- grid index to find nodes near a station ----
const CELL = 0.004;
const grid = new Map<string, number[]>();
const cellKey = (lon: number, lat: number) => `${Math.floor(lon / CELL)},${Math.floor(lat / CELL)}`;
coords.forEach(([lon, lat], i) => {
  const k = cellKey(lon, lat);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k)!.push(i);
});
function nodesNear(p: LngLat, radius: number, max: number): [number, number][] {
  const out: [number, number][] = [];
  const cx = Math.floor(p[0] / CELL);
  const cy = Math.floor(p[1] / CELL);
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (const i of grid.get(`${x},${y}`) ?? []) {
        const d = distance(coords[i], p);
        if (d <= radius) out.push([i, d]);
      }
    }
  }
  return out.sort((a, b) => a[1] - b[1]).slice(0, max);
}

// ---- A* between two stations over the graph ----
function route(a: LngLat, b: LngLat): LngLat[] | null {
  const straight = distance(a, b);
  const limit = straight * 1.6 + 300; // a real track is never much longer than the crow-flies distance
  const starts = nodesNear(a, 400, 8);
  const goals = new Map(nodesNear(b, 400, 8));
  if (!starts.length || !goals.size) return null;

  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  const open: [number, number][] = []; // [priority, node] (small, linear scan is fine)
  for (const [n, d] of starts) {
    best.set(n, d);
    open.push([d + distance(coords[n], b), n]);
  }
  let found = -1;
  let foundCost = Infinity;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [pri, n] = open.splice(bi, 1)[0];
    if (pri > foundCost || pri > limit) break;
    const g = best.get(n)!;
    if (goals.has(n)) {
      const total = g + goals.get(n)!;
      if (total < foundCost) { foundCost = total; found = n; }
      continue;
    }
    for (const [m, w] of adj[n]) {
      const ng = g + w;
      if (ng < (best.get(m) ?? Infinity)) {
        best.set(m, ng);
        prev.set(m, n);
        open.push([ng + distance(coords[m], b), m]);
      }
    }
  }
  if (found < 0) return null;
  const path: LngLat[] = [];
  for (let n: number | undefined = found; n !== undefined; n = prev.get(n)) path.push(coords[n]);
  path.reverse();
  return [a, ...path, b];
}

// ---- run for every link of every line ----
const lines = await loadAllLines();
const out: Record<string, LngLat[]> = {};
let ok = 0;
let missed = 0;
for (const line of lines) {
  const at = new Map(line.stations.map((s) => [s.id, [s.lon, s.lat] as LngLat]));
  for (const [x, y] of line.links) {
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${a}|${b}`;
    if (out[key]) continue;
    const pa = at.get(a);
    const pb = at.get(b);
    if (!pa || !pb) continue;
    const r = route(pa, pb);
    if (r) { out[key] = r; ok++; } else missed++;
  }
}
writeFileSync("data/tracks.json", JSON.stringify(out));
console.log(`links snapped to real track: ${ok}, no route (kept straight): ${missed}`);
