// One-off: give every line a "lane" wherever it shares a corridor with other lines, so
// they can be drawn side by side like Mini Tokyo 3D instead of on top of each other.
//
// Output: data/lanes.json  { "lineId|stationA|stationB": offset }
//   offset is in lane units (1 = one lane width), to the LEFT of the link's stored
//   direction (A to B), so a line alone on its track has 0 and two lines sharing a
//   corridor get -0.5 and +0.5. The browser turns lane units into metres for the zoom.
import { readFileSync, writeFileSync } from "node:fs";
import { loadAllLines, type LngLat } from "../src/lines.js";

const tracks = JSON.parse(readFileSync("data/tracks.json", "utf8")) as Record<string, LngLat[]>;
const lines = await loadAllLines();

const KX = 111320 * Math.cos((51.5 * Math.PI) / 180);
const KY = 111320;
const STEP = 20; // sample the track every 20 m
const NEAR = 22; // two samples closer than this are the same track
const MIN_SHARE = 0.5; // a link counts as shared when half of it runs alongside another

interface Sample { x: number; y: number; tx: number; ty: number }
interface Link {
  key: string;
  line: string;
  a: string;
  b: string;
  samples: Sample[];
  startT: [number, number]; // tangent at the start, along the stored direction
  endT: [number, number];
}

function sample(poly: LngLat[]): { samples: Sample[]; startT: [number, number]; endT: [number, number] } {
  const p = poly.map(([lon, lat]) => [lon * KX, lat * KY] as [number, number]);
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const total = cum[cum.length - 1];
  const tangent = (i: number): [number, number] => {
    const j = Math.min(i + 1, p.length - 1);
    const k = Math.max(j - 1, 0);
    const dx = p[j][0] - p[k][0];
    const dy = p[j][1] - p[k][1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const samples: Sample[] = [];
  let seg = 1;
  const n = Math.max(2, Math.ceil(total / STEP) + 1);
  for (let s = 0; s < n; s++) {
    const d = (total * s) / (n - 1);
    while (seg < p.length - 1 && cum[seg] < d) seg++;
    const span = cum[seg] - cum[seg - 1] || 1;
    const f = Math.min(1, Math.max(0, (d - cum[seg - 1]) / span));
    const [tx, ty] = tangent(seg - 1);
    samples.push({
      x: p[seg - 1][0] + (p[seg][0] - p[seg - 1][0]) * f,
      y: p[seg - 1][1] + (p[seg][1] - p[seg - 1][1]) * f,
      tx,
      ty,
    });
  }
  return { samples, startT: tangent(0), endT: tangent(p.length - 2) };
}

const links: Link[] = [];
for (const [key, poly] of Object.entries(tracks)) {
  const [line, a, b] = key.split("|");
  if (poly.length < 2) continue;
  links.push({ key, line, a, b, ...sample(poly) });
}
console.log(`${links.length} links`);

// ---- which links of other lines run alongside each link ----
const CELL = 40;
const grid = new Map<string, [number, number][]>(); // cell -> [link, sample]
const cellOf = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
links.forEach((l, i) => l.samples.forEach((s, j) => {
  const k = cellOf(s.x, s.y);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k)!.push([i, j]);
}));

// shared[i] -> Map(j -> { hits, dot })
const shared: Map<number, { hits: number; dot: number }>[] = links.map(() => new Map());
links.forEach((l, i) => {
  for (const s of l.samples) {
    const cx = Math.floor(s.x / CELL);
    const cy = Math.floor(s.y / CELL);
    const seen = new Set<number>();
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const [j, sj] of grid.get(`${x},${y}`) ?? []) {
          if (j === i || links[j].line === l.line || seen.has(j)) continue;
          const o = links[j].samples[sj];
          if (Math.hypot(o.x - s.x, o.y - s.y) > NEAR) continue;
          const dot = o.tx * s.tx + o.ty * s.ty;
          if (Math.abs(dot) < 0.6) continue; // crossing, not running alongside
          seen.add(j);
          const e = shared[i].get(j) ?? { hits: 0, dot: 0 };
          e.hits++;
          e.dot += dot;
          shared[i].set(j, e);
        }
      }
    }
  }
});

// ---- a consistent left/right: orient every link along its corridor ----
// sigma[i] = +1 or -1. Linked links must agree about which way "forward" is.
const edges: [number, number][][] = links.map(() => []); // [other, relation]
links.forEach((_, i) => {
  for (const [j, e] of shared[i]) {
    if (e.hits >= MIN_SHARE * Math.min(links[i].samples.length, links[j].samples.length)) {
      edges[i].push([j, e.dot >= 0 ? 1 : -1]);
    }
  }
});
// links of one line that meet at a station continue each other
const byStation = new Map<string, number[]>();
links.forEach((l, i) => {
  for (const s of [l.a, l.b]) {
    const k = `${l.line}|${s}`;
    if (!byStation.has(k)) byStation.set(k, []);
    byStation.get(k)!.push(i);
  }
});
for (const [k, ids] of byStation) {
  const station = k.split("|")[1];
  const tangentAt = (i: number): [number, number] => (links[i].a === station ? links[i].startT : links[i].endT);
  for (let u = 0; u < ids.length; u++) {
    for (let v = u + 1; v < ids.length; v++) {
      const [i, j] = [ids[u], ids[v]];
      const ti = tangentAt(i);
      const tj = tangentAt(j);
      // going through the station, a link that ends here points in, one that starts here points out
      const si = links[i].b === station ? 1 : -1;
      const sj = links[j].b === station ? 1 : -1;
      const through = (ti[0] * tj[0] + ti[1] * tj[1]) * (si === sj ? -1 : 1);
      edges[i].push([j, through >= 0 ? 1 : -1]);
      edges[j].push([i, through >= 0 ? 1 : -1]);
    }
  }
}
const sigma = new Array<number>(links.length).fill(0);
for (let r = 0; r < links.length; r++) {
  if (sigma[r]) continue;
  sigma[r] = 1;
  const queue = [r];
  while (queue.length) {
    const i = queue.shift()!;
    for (const [j, rel] of edges[i]) {
      if (sigma[j]) continue;
      sigma[j] = sigma[i] * rel;
      queue.push(j);
    }
  }
}

// ---- lanes: lines sharing a corridor are spread evenly across it ----
const out: Record<string, number> = {};
const sizes: Record<number, number> = {};
links.forEach((l, i) => {
  const members = new Set<string>([l.line]);
  for (const [j] of edges[i]) {
    const e = shared[i].get(j);
    if (e && links[j].line !== l.line) members.add(links[j].line);
  }
  const order = [...members].sort();
  sizes[order.length] = (sizes[order.length] ?? 0) + 1;
  const lane = order.indexOf(l.line) - (order.length - 1) / 2;
  const off = Math.round(lane * sigma[i] * 100) / 100;
  if (off !== 0) out[l.key] = off;
});

writeFileSync("data/lanes.json", JSON.stringify(out));
console.log("lines sharing a link (count -> links):", sizes);
console.log(`links with a lane offset: ${Object.keys(out).length} of ${links.length}`);
