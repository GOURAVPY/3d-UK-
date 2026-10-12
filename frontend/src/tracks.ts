import { MercatorCoordinate } from "maplibre-gl";

// All train geometry lives in metres east/north of this point, so float32 stays
// precise on the GPU.
export const ORIGIN = MercatorCoordinate.fromLngLat([-0.1276, 51.5072], 0);
export const METRE = ORIGIN.meterInMercatorCoordinateUnits();

export function toLocal(lon: number, lat: number): [number, number] {
  const m = MercatorCoordinate.fromLngLat([lon, lat], 0);
  return [(m.x - ORIGIN.x) / METRE, -(m.y - ORIGIN.y) / METRE];
}

export function fromLocal(x: number, y: number): [number, number] {
  const ll = new MercatorCoordinate(ORIGIN.x + x * METRE, ORIGIN.y - y * METRE, 0).toLngLat();
  return [ll.lng, ll.lat];
}

// A run of track in local metres, with the distance travelled at each vertex.
export interface Chain {
  x: number[];
  y: number[];
  cum: number[];
  length: number;
  // lane offset (lane units, to the left of travel) at distances laneS along the chain
  laneS: number[];
  laneV: number[];
}

// Gap between neighbouring lanes: constant on screen when zoomed out, never tighter than
// LANE_MIN_M when zoomed in. Mini Tokyo 3D scales its track spacing the same way.
const LANE_PX = 12;
const LANE_MIN_M = 14;
export function laneSpacingMetres(zoom: number): number {
  const mpp = (78271.517 * Math.cos((51.5 * Math.PI) / 180)) / 2 ** zoom;
  return Math.max(LANE_PX * mpp, LANE_MIN_M);
}

// Lane value at `s` metres along the chain (linear between the control points).
export function laneAt(c: Chain, s: number): number {
  const n = c.laneS.length;
  if (n === 1 || s <= c.laneS[0]) return c.laneV[0];
  if (s >= c.laneS[n - 1]) return c.laneV[n - 1];
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.laneS[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  const span = c.laneS[lo] - c.laneS[lo - 1];
  const f = span > 0 ? (s - c.laneS[lo - 1]) / span : 1;
  return c.laneV[lo - 1] + (c.laneV[lo] - c.laneV[lo - 1]) * f;
}

function makeChain(points: [number, number][]): Chain {
  const x: number[] = [];
  const y: number[] = [];
  const cum: number[] = [];
  for (const [px, py] of points) {
    if (x.length) cum.push(cum[cum.length - 1] + Math.hypot(px - x[x.length - 1], py - y[y.length - 1]));
    else cum.push(0);
    x.push(px);
    y.push(py);
  }
  return { x, y, cum, length: cum[cum.length - 1], laneS: [0], laneV: [0] };
}

// Two points `ahead` metres apart, pointing along a compass heading: a tiny stub of track
// for a train that has no known track yet.
export function stubChain(x: number, y: number, headingDeg: number): Chain {
  const a = (headingDeg * Math.PI) / 180;
  return makeChain([[x, y], [x + Math.sin(a), y + Math.cos(a)]]);
}

// Point `s` metres along the chain. Past either end the last segment is extended in a
// straight line, so carriages hanging over the end of the known track keep their heading.
export function pointAt(c: Chain, s: number, out: [number, number]): void {
  const n = c.x.length;
  if (s <= 0 || s >= c.length) {
    const first = s <= 0;
    const i = first ? 0 : n - 2;
    const dx = c.x[i + 1] - c.x[i];
    const dy = c.y[i + 1] - c.y[i];
    const l = Math.hypot(dx, dy) || 1;
    const base = first ? 0 : 1;
    const over = first ? s : s - c.length;
    out[0] = c.x[i + base] + (dx / l) * over;
    out[1] = c.y[i + base] + (dy / l) * over;
    return;
  }
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.cum[mid] < s) lo = mid + 1;
    else hi = mid;
  }
  const seg = c.cum[lo] - c.cum[lo - 1] || 1;
  const f = (s - c.cum[lo - 1]) / seg;
  out[0] = c.x[lo - 1] + (c.x[lo] - c.x[lo - 1]) * f;
  out[1] = c.y[lo - 1] + (c.y[lo] - c.y[lo - 1]) * f;
}

// Distance along the chain of the point nearest (x, y), and how far away it is.
export function project(c: Chain, x: number, y: number): { s: number; dist: number } {
  let best = { s: 0, dist: Infinity };
  for (let i = 1; i < c.x.length; i++) {
    const ax = c.x[i - 1];
    const ay = c.y[i - 1];
    const dx = c.x[i] - ax;
    const dy = c.y[i] - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2));
    const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
    if (d < best.dist) best = { s: c.cum[i - 1] + (c.cum[i] - c.cum[i - 1]) * t, dist: d };
  }
  return best;
}

// Builds chains of track from station ids, using the real shape of each station link.
export class TrackIndex {
  private cache = new Map<string, { chain: Chain; offsets: number[] } | null>();

  constructor(
    private stations: Map<string, [number, number]>, // id -> [lon, lat]
    private shapes: Record<string, [number, number][]>, // "lineId|a|b" (a < b) -> lon/lat polyline
    private lanes: Record<string, number> = {}, // same keys -> lane offset left of a to b
  ) {}

  // Lane offset, to the left of travel, when going from station a to station b on a line.
  private lane(lineId: string, a: string, b: string): number {
    const forward = a < b;
    const off = this.lanes[forward ? `${lineId}|${a}|${b}` : `${lineId}|${b}|${a}`] ?? 0;
    return forward ? off : -off;
  }

  stationLocal(id: string): [number, number] | null {
    const p = this.stations.get(id);
    return p ? toLocal(p[0], p[1]) : null;
  }

  // Polyline from station a to station b in local metres (straight if no shape is known).
  private link(lineId: string, a: string, b: string): [number, number][] | null {
    const pa = this.stations.get(a);
    const pb = this.stations.get(b);
    if (!pa || !pb) return null;
    const forward = a < b;
    const shape = this.shapes[forward ? `${lineId}|${a}|${b}` : `${lineId}|${b}|${a}`];
    const lonlat = shape ? (forward ? shape : [...shape].reverse()) : [pa, pb];
    return lonlat.map(([lon, lat]) => toLocal(lon, lat));
  }

  // Chain through the stations in order. offsets[i] is the distance at which station i
  // sits (the start of the link leaving it); the last entry is the end of the chain.
  chain(lineId: string, ids: string[]): { chain: Chain; offsets: number[] } | null {
    const key = `${lineId}|${ids.join("|")}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const points: [number, number][] = [];
    const starts: number[] = []; // index in points where each link begins
    const lane: number[] = []; // lane of each link, to the left of travel
    let ok = ids.length >= 2;
    for (let i = 0; ok && i < ids.length - 1; i++) {
      const seg = this.link(lineId, ids[i], ids[i + 1]);
      if (!seg || seg.length < 2) {
        ok = false;
        break;
      }
      // Where this link starts behind where the last one ended, the join would make the
      // train drive forward then double back. Cut the end of the previous link instead.
      const floor = (starts.length ? starts[starts.length - 1] : 0) + 1;
      while (points.length > floor) {
        const last = points[points.length - 1];
        const before = points[points.length - 2];
        const along = (seg[0][0] - last[0]) * (last[0] - before[0]) + (seg[0][1] - last[1]) * (last[1] - before[1]);
        if (along >= 0) break;
        points.pop();
      }
      const last = points[points.length - 1];
      const same = last && Math.hypot(seg[0][0] - last[0], seg[0][1] - last[1]) < 0.5;
      starts.push(same ? points.length - 1 : points.length);
      lane.push(this.lane(lineId, ids[i], ids[i + 1]));
      points.push(...(same ? seg.slice(1) : seg));
    }
    let result: { chain: Chain; offsets: number[] } | null = null;
    if (ok) {
      const chain = makeChain(points);
      // ease between the lanes of consecutive links over their last and first stretch
      const n = starts.length;
      for (let i = 0; i < n; i++) {
        const s0 = chain.cum[starts[i]];
        const s1 = i + 1 < n ? chain.cum[starts[i + 1]] : chain.length;
        const head = i > 0 ? (lane[i - 1] + lane[i]) / 2 : lane[i];
        const tail = i < n - 1 ? (lane[i] + lane[i + 1]) / 2 : lane[i];
        const r = Math.min(150, (s1 - s0) * 0.45);
        chain.laneS.push(s0, s0 + r, s1 - r, s1);
        chain.laneV.push(head, lane[i], lane[i], tail);
      }
      chain.laneS.shift();
      chain.laneV.shift();
      result = { chain, offsets: [...starts.map((i) => chain.cum[i]), chain.length] };
    }
    this.cache.set(key, result);
    return result;
  }

  // Every link of every line as a drawable line, shifted sideways into its lane.
  // `spacingM` is the width of one lane in metres at the current zoom.
  lineFeatures(
    lines: { id: string; colour: string; links: [string, string][] }[],
    spacingM: number,
  ): {
    type: "FeatureCollection";
    features: {
      type: "Feature";
      properties: { colour: string; line: string };
      geometry: { type: "LineString"; coordinates: [number, number][] };
    }[];
  } {
    const features: ReturnType<TrackIndex["lineFeatures"]>["features"] = [];
    for (const line of lines) {
      const seen = new Set<string>();
      const links: { a: string; b: string; off: number }[] = [];
      for (const [p, q] of line.links) {
        const [a, b] = p < q ? [p, q] : [q, p];
        const key = `${line.id}|${a}|${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ a, b, off: this.lanes[key] ?? 0 });
      }
      const atStation = new Map<string, number[]>();
      links.forEach((l, i) => {
        for (const s of [l.a, l.b]) {
          if (!atStation.has(s)) atStation.set(s, []);
          atStation.get(s)!.push(i);
        }
      });
      // lane value at a link end: averaged with the links that carry on through the station
      const endValue = (i: number, station: string, atEnd: boolean) => {
        let sum = links[i].off;
        let n = 1;
        for (const j of atStation.get(station) ?? []) {
          if (j === i) continue;
          const startsHere = links[j].a === station;
          sum += atEnd === startsHere ? links[j].off : -links[j].off;
          n++;
        }
        return sum / n;
      };

      links.forEach((l, i) => {
        const poly = this.link(line.id, l.a, l.b);
        if (!poly || poly.length < 2) return;
        const c = makeChain(poly);
        const vs = endValue(i, l.a, false);
        const ve = endValue(i, l.b, true);
        const r = Math.min(150, c.length * 0.45);
        const coords: [number, number][] = poly.map(([x, y], k) => {
          const d = c.cum[k];
          const v = d < r ? vs + (l.off - vs) * (d / r) : d > c.length - r ? l.off + (ve - l.off) * ((d - (c.length - r)) / r) : l.off;
          const k0 = Math.max(k - 1, 0);
          const k1 = Math.min(k + 1, poly.length - 1);
          const tx = poly[k1][0] - poly[k0][0];
          const ty = poly[k1][1] - poly[k0][1];
          const len = Math.hypot(tx, ty) || 1;
          return fromLocal(x - (ty / len) * v * spacingM, y + (tx / len) * v * spacingM);
        });
        features.push({
          type: "Feature",
          properties: { colour: line.colour, line: line.id },
          geometry: { type: "LineString", coordinates: coords },
        });
      });
    }
    return { type: "FeatureCollection", features };
  }
}
