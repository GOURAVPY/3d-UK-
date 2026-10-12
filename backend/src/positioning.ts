import { bearingAt, distance, makeTrack, pointAt, type Track } from "./geo.js";
import type { Line, LngLat } from "./lines.js";

// Average running speed between stations, in metres per second. A tunable guess.
const SPEED: Record<string, number> = {
  tube: 11,
  dlr: 9,
  "elizabeth-line": 17,
  overground: 14,
};
const SNAP_METRES = 150;

const clean = (s: string) =>
  s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\b(underground|dlr|rail|station)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export class LineTracks {
  private paths: Track[];
  private coord = new Map<string, LngLat>();
  private name = new Map<string, string>();
  private near = new Map<string, Set<string>>();
  private cache = new Map<string, Track | null>();
  readonly speed: number;

  constructor(line: Line) {
    this.paths = line.paths.map(makeTrack);
    this.speed = SPEED[line.mode] ?? 11;
    for (const s of line.stations) {
      this.coord.set(s.id, [s.lon, s.lat]);
      this.name.set(s.id, clean(s.name));
    }
    for (const [a, b] of line.links) {
      if (!this.near.has(a)) this.near.set(a, new Set());
      if (!this.near.has(b)) this.near.set(b, new Set());
      this.near.get(a)!.add(b);
      this.near.get(b)!.add(a);
    }
  }

  station(id: string): LngLat | undefined {
    return this.coord.get(id);
  }

  // The station behind a train: a neighbour of its next stop that is not the stop after it.
  // At a terminus the stop after is the same neighbour (the train turns back), so keep it then.
  prevStation(next: string, following: string | undefined, hint: string): string | null {
    const all = [...(this.near.get(next) ?? [])];
    const ahead = all.filter((id) => id !== following);
    const options = ahead.length ? ahead : all;
    if (options.length <= 1) return options[0] ?? null;
    const h = clean(hint);
    return options.find((id) => h.includes(this.name.get(id) ?? "\0")) ?? options[0];
  }

  // Track from `prev` to `next`: the shortest stretch of any path that touches both.
  trackBetween(prev: string, next: string): Track | null {
    const key = `${prev}|${next}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const a = this.coord.get(prev);
    const b = this.coord.get(next);
    let best: Track | null = null;
    if (a && b) {
      for (const p of this.paths) {
        const ia = nearest(p, a);
        const ib = nearest(p, b);
        if (ia < 0 || ib < 0 || ia === ib) continue;
        const slice = ia < ib ? p.coords.slice(ia, ib + 1) : p.coords.slice(ib, ia + 1).reverse();
        const t = makeTrack(slice);
        if (!best || t.length < best.length) best = t;
      }
      best ??= makeTrack([a, b]); // no shared path: straight line between the stations
    }
    this.cache.set(key, best);
    return best;
  }

  // Direction of travel (compass degrees) at that same spot.
  headingAt(track: Track, secondsToNext: number): number {
    const remaining = Math.min(Math.max(secondsToNext, 0) * this.speed, track.length);
    return bearingAt(track, track.length - remaining);
  }

  // Where a train is when it is `secondsToNext` seconds from its next station.
  positionAt(track: Track, secondsToNext: number): LngLat {
    const remaining = Math.min(Math.max(secondsToNext, 0) * this.speed, track.length);
    return pointAt(track, track.length - remaining);
  }
}

function nearest(p: Track, pt: LngLat): number {
  let best = -1;
  let bestD = SNAP_METRES;
  p.coords.forEach((c, i) => {
    const d = distance(c, pt);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
