// One-off: give every station-to-station link of every line its real track shape.
//
// Each line is routed over ITS OWN track only (from its OpenStreetMap route relation),
// not over every railway in the area, so a line in a four-track corridor stays on its own
// tracks. A link starts and ends on whichever of that line's track nodes near the station
// gives the best route, so it never hops to the opposite side of the platform.
//
// Input:  data/raw/osm-lines.json (fetch-osm-lines.mjs), data/raw/osm-rail.json (fetch-osm.mjs,
//         only used for lines with no relation) and the live TfL station links.
// Output: data/tracks.json  { "lineId|stationA|stationB": [[lon, lat], ...] }  (A < B, oriented A -> B)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { distance } from "../src/geo.js";
import { loadAllLines, type LngLat } from "../src/lines.js";

interface Geom { lat: number; lon: number }
interface Way { geometry?: Geom[] }
interface Relation { tags?: { name?: string }; members?: { type: string; geometry?: Geom[] }[] }

class Graph {
  coords: LngLat[] = [];
  private ids = new Map<string, number>();
  private adj: [number, number][][] = [];
  private grid = new Map<string, number[]>();
  private static CELL = 0.004;

  static fromWays(ways: Geom[][]): Graph {
    const g = new Graph();
    for (const w of ways) {
      for (let i = 1; i < w.length; i++) {
        const a = g.node(w[i - 1].lon, w[i - 1].lat);
        const b = g.node(w[i].lon, w[i].lat);
        if (a === b) continue;
        const d = distance(g.coords[a], g.coords[b]);
        g.adj[a].push([b, d]);
        g.adj[b].push([a, d]);
      }
    }
    g.coords.forEach(([lon, lat], i) => {
      const k = `${Math.floor(lon / Graph.CELL)},${Math.floor(lat / Graph.CELL)}`;
      if (!g.grid.has(k)) g.grid.set(k, []);
      g.grid.get(k)!.push(i);
    });
    return g;
  }

  private node(lon: number, lat: number): number {
    const key = `${lon.toFixed(6)},${lat.toFixed(6)}`;
    let id = this.ids.get(key);
    if (id === undefined) {
      id = this.coords.length;
      this.ids.set(key, id);
      this.coords.push([lon, lat]);
      this.adj.push([]);
    }
    return id;
  }

  get size() {
    return this.coords.length;
  }

  indexOf(p: LngLat): number | undefined {
    return this.ids.get(`${p[0].toFixed(6)},${p[1].toFixed(6)}`);
  }

  // Up to `max` nodes within `radius` metres of p, nearest first.
  near(p: LngLat, radius: number, max: number): number[] {
    const cx = Math.floor(p[0] / Graph.CELL);
    const cy = Math.floor(p[1] / Graph.CELL);
    const found: [number, number][] = [];
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const i of this.grid.get(`${x},${y}`) ?? []) {
          const d = distance(this.coords[i], p);
          if (d <= radius) found.push([d, i]);
        }
      }
    }
    return found.sort((u, v) => u[0] - v[0]).slice(0, max).map((f) => f[1]);
  }

  // A* from any of `froms` to any of `tos` (heading for the point `goal`);
  // null if there is no route within `limit` metres.
  route(froms: number[], tos: number[], goal: LngLat, limit: number): LngLat[] | null {
    const isGoal = new Set(tos);
    const best = new Map<number, number>();
    const prev = new Map<number, number>();
    const open: [number, number][] = [];
    for (const f of froms) {
      best.set(f, 0);
      open.push([distance(this.coords[f], goal), f]);
    }
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [pri, n] = open.splice(bi, 1)[0];
      if (pri > limit) return null;
      if (isGoal.has(n)) {
        const path: LngLat[] = [];
        for (let c: number | undefined = n; c !== undefined; c = prev.get(c)) path.push(this.coords[c]);
        return path.reverse();
      }
      const g = best.get(n)!;
      for (const [m, w] of this.adj[n]) {
        const ng = g + w;
        if (ng < (best.get(m) ?? Infinity)) {
          best.set(m, ng);
          prev.set(m, n);
          open.push([ng + distance(this.coords[m], goal), m]);
        }
      }
    }
    return null;
  }
}

const relations: Relation[] = existsSync("data/raw/osm-lines.json")
  ? (JSON.parse(readFileSync("data/raw/osm-lines.json", "utf8")).elements as Relation[])
  : [];
const genericWays: Geom[][] = existsSync("data/raw/osm-rail.json")
  ? (JSON.parse(readFileSync("data/raw/osm-rail.json", "utf8")).elements as Way[])
      .filter((w) => w.geometry)
      .map((w) => w.geometry!)
  : [];
console.log(`${relations.length} line relations, ${genericWays.length} generic ways`);
let genericGraph: Graph | null = null;

const SNAP = 90; // a link may start and end on any track node this close to its station
const CANDIDATES = 14;

function relationsFor(line: { id: string; name: string }): Relation[] {
  const base = line.name.replace(/ line$/i, "").toLowerCase();
  const wanted = line.id === "dlr" ? ["dlr", "docklands"] : [base];
  return relations.filter((r) => {
    const n = (r.tags?.name ?? "").toLowerCase();
    return wanted.some((w) => n.startsWith(w));
  });
}

const lines = await loadAllLines();
const out: Record<string, LngLat[]> = {};
let snapped = 0;
let straight = 0;

for (const line of lines) {
  const rels = relationsFor(line);
  const ways = rels.flatMap((r) =>
    (r.members ?? []).filter((m) => m.type === "way" && m.geometry).map((m) => m.geometry!),
  );
  let graph: Graph | null = ways.length ? Graph.fromWays(ways) : null;
  let source = `${rels.length} relations`;
  if (!graph || graph.size < 20) {
    genericGraph ??= Graph.fromWays(genericWays);
    graph = genericGraph;
    source = "generic track (no relation)";
  }

  const at = new Map(line.stations.map((s) => [s.id, [s.lon, s.lat] as LngLat]));
  const chosen = new Map<string, number>(); // station -> track node its links share
  let ok = 0;
  let miss = 0;
  for (const [x, y] of line.links) {
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${line.id}|${a}|${b}`;
    if (out[key]) continue;
    const pa = at.get(a);
    const pb = at.get(b);
    if (!pa || !pb) continue;
    // Each station keeps the node its first link used, so the next link starts exactly
    // where the last one ended. Only when that has no route do we let the router choose.
    const limit = distance(pa, pb) * 1.8 + 300;
    const fixedA = chosen.get(a) !== undefined ? [chosen.get(a)!] : graph.near(pa, SNAP, 1);
    const fixedB = chosen.get(b) !== undefined ? [chosen.get(b)!] : graph.near(pb, SNAP, 1);
    const looseA = graph.near(pa, SNAP, CANDIDATES);
    const looseB = graph.near(pb, SNAP, CANDIDATES);
    let path: LngLat[] | null = null;
    for (const [fa, fb] of [[fixedA, fixedB], [fixedA, looseB], [looseA, fixedB], [looseA, looseB]]) {
      if (!fa.length || !fb.length) continue;
      path = graph.route(fa, fb, pb, limit);
      if (path) break;
    }
    if (path && path.length >= 2) {
      const first = graph.indexOf(path[0]);
      const last = graph.indexOf(path[path.length - 1]);
      if (first !== undefined && !chosen.has(a)) chosen.set(a, first);
      if (last !== undefined && !chosen.has(b)) chosen.set(b, last);
    }
    if (path && path.length >= 2) {
      out[key] = path;
      ok++;
    } else {
      out[key] = [pa, pb];
      miss++;
    }
  }
  snapped += ok;
  straight += miss;
  console.log(
    `${line.id.padEnd(18)} ${source.padEnd(28)} links ${String(ok + miss).padStart(3)}  on track ${String(ok).padStart(3)}  straight ${miss}`,
  );
}

writeFileSync("data/tracks.json", JSON.stringify(out));
console.log(`total: ${snapped} links on real track, ${straight} straight`);
