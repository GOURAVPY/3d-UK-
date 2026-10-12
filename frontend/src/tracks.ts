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
  return { x, y, cum, length: cum[cum.length - 1] };
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
  ) {}

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
      points.push(...(same ? seg.slice(1) : seg));
    }
    let result: { chain: Chain; offsets: number[] } | null = null;
    if (ok) {
      const chain = makeChain(points);
      result = { chain, offsets: [...starts.map((i) => chain.cum[i]), chain.length] };
    }
    this.cache.set(key, result);
    return result;
  }
}
