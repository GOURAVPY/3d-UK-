// One-off: for every stretch of every link, is the track underground, on a bridge or
// viaduct, or on the surface?  Read from the OpenStreetMap `tunnel`, `bridge` and `layer`
// tags of the nearest rail way.
//
// Input:  data/tracks.json (build-tracks.ts) and data/raw/osm-rail.json (fetch-osm.mjs)
// Output: data/levels.json  { "lineId|stationA|stationB": [[metresFromStart, level], ...] }
//   level is -1 underground, 1 elevated (bridge / viaduct), 0 surface (left out when a
//   whole link is on the surface). Each pair says "from this distance on, this level".
import { readFileSync, writeFileSync } from "node:fs";
import type { LngLat } from "../src/lines.js";

interface Way {
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

const KX = 111320 * Math.cos((51.5 * Math.PI) / 180);
const KY = 111320;
const STEP = 12; // metres between samples along a link
const REACH = 16; // a way further than this from the sample is not "the same track"
const MIN_RUN = 45; // runs shorter than this are folded into their neighbour

function levelOf(tags: Record<string, string> = {}): number {
  const layer = Number(tags.layer ?? 0);
  const tunnel = ["yes", "building_passage", "covered"].includes(tags.tunnel ?? "");
  const bridge = !!tags.bridge && tags.bridge !== "no";
  if (tunnel || (layer < 0 && !bridge)) return -1;
  if (bridge || layer > 0) return 1;
  return 0;
}

// ---- index every segment of every way ----
const ways = (JSON.parse(readFileSync("data/raw/osm-rail.json", "utf8")).elements as Way[]).filter((w) => w.geometry);
interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  level: number;
}
const CELL = 60;
const grid = new Map<string, Seg[]>();
for (const w of ways) {
  const level = levelOf(w.tags);
  const g = w.geometry!;
  for (let i = 1; i < g.length; i++) {
    const seg: Seg = {
      ax: g[i - 1].lon * KX,
      ay: g[i - 1].lat * KY,
      bx: g[i].lon * KX,
      by: g[i].lat * KY,
      level,
    };
    const x0 = Math.floor(Math.min(seg.ax, seg.bx) / CELL) - 0;
    const x1 = Math.floor(Math.max(seg.ax, seg.bx) / CELL);
    const y0 = Math.floor(Math.min(seg.ay, seg.by) / CELL);
    const y1 = Math.floor(Math.max(seg.ay, seg.by) / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = `${x},${y}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(seg);
      }
    }
  }
}

function nearestLevel(x: number, y: number): number | null {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  let best = REACH;
  let level: number | null = null;
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (const s of grid.get(`${gx},${gy}`) ?? []) {
        const dx = s.bx - s.ax;
        const dy = s.by - s.ay;
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.min(1, Math.max(0, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
        const d = Math.hypot(x - (s.ax + dx * t), y - (s.ay + dy * t));
        if (d < best) {
          best = d;
          level = s.level;
        }
      }
    }
  }
  return level;
}

// ---- walk every link ----
const tracks = JSON.parse(readFileSync("data/tracks.json", "utf8")) as Record<string, LngLat[]>;
const out: Record<string, [number, number][]> = {};
const metres: Record<string, number> = { "-1": 0, "0": 0, "1": 0 };
let withLevels = 0;

for (const [key, poly] of Object.entries(tracks)) {
  const p = poly.map(([lon, lat]) => [lon * KX, lat * KY] as [number, number]);
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const total = cum[cum.length - 1];
  if (total < 1) continue;

  // level at every sample, remembering the last known level where no way is close
  const levels: number[] = [];
  let last = 0;
  let seg = 1;
  for (let d = 0; d <= total; d += STEP) {
    while (seg < p.length - 1 && cum[seg] < d) seg++;
    const f = Math.min(1, Math.max(0, (d - cum[seg - 1]) / (cum[seg] - cum[seg - 1] || 1)));
    const x = p[seg - 1][0] + (p[seg][0] - p[seg - 1][0]) * f;
    const y = p[seg - 1][1] + (p[seg][1] - p[seg - 1][1]) * f;
    last = nearestLevel(x, y) ?? last;
    levels.push(last);
  }

  // runs, then fold short ones into the previous run so tiny flickers disappear
  let runs: [number, number][] = [];
  levels.forEach((lv, i) => {
    if (!runs.length || runs[runs.length - 1][1] !== lv) runs.push([i * STEP, lv]);
  });
  for (let pass = 0; pass < 3; pass++) {
    const kept: [number, number][] = [];
    for (let i = 0; i < runs.length; i++) {
      const end = i + 1 < runs.length ? runs[i + 1][0] : total;
      if (kept.length && end - runs[i][0] < MIN_RUN) continue; // absorbed by the previous run
      if (kept.length && kept[kept.length - 1][1] === runs[i][1]) continue;
      kept.push(runs[i]);
    }
    runs = kept;
  }
  runs[0][0] = 0;

  runs.forEach(([start, lv], i) => {
    const end = i + 1 < runs.length ? runs[i + 1][0] : total;
    metres[String(lv)] += end - start;
  });
  if (runs.some(([, lv]) => lv !== 0)) {
    out[key] = runs;
    withLevels++;
  }
}

writeFileSync("data/levels.json", JSON.stringify(out));
const all = metres["-1"] + metres["0"] + metres["1"];
const pct = (v: number) => `${((100 * v) / all).toFixed(0)}%`;
console.log(`links with an underground or elevated stretch: ${withLevels} of ${Object.keys(tracks).length}`);
console.log(
  `track length: underground ${pct(metres["-1"])}, surface ${pct(metres["0"])}, elevated ${pct(metres["1"])}`,
);
