import type { LngLat } from "./lines.js";

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

// Distance in metres between two [lon, lat] points.
export function distance(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Track {
  coords: LngLat[];
  cum: number[]; // cumulative distance at each vertex
  length: number;
}

export function makeTrack(coords: LngLat[]): Track {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distance(coords[i - 1], coords[i]));
  return { coords, cum, length: cum[cum.length - 1] };
}

// Point at `d` metres along the track from its first vertex.
export function pointAt(t: Track, d: number): LngLat {
  if (d <= 0 || t.coords.length === 1) return t.coords[0];
  if (d >= t.length) return t.coords[t.coords.length - 1];
  let i = 1;
  while (t.cum[i] < d) i++;
  const f = (d - t.cum[i - 1]) / (t.cum[i] - t.cum[i - 1] || 1);
  const [x0, y0] = t.coords[i - 1];
  const [x1, y1] = t.coords[i];
  return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
}

// Compass bearing in degrees (0 = north, 90 = east) of the track at `d` metres from its start.
export function bearingAt(t: Track, d: number): number {
  const a = pointAt(t, Math.max(d - 15, 0));
  const b = pointAt(t, Math.min(d + 15, t.length));
  const east = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const north = b[1] - a[1];
  return ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}
