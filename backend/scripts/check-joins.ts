// Sanity check: how far apart are the two link ends that meet at a station?
import { readFileSync } from "node:fs";
import { distance } from "../src/geo.js";
import { loadAllLines, type LngLat } from "../src/lines.js";

const tracks = JSON.parse(readFileSync("data/tracks.json", "utf8")) as Record<string, LngLat[]>;
const lines = await loadAllLines();
const gaps: number[] = [];
for (const line of lines) {
  const ends = new Map<string, LngLat[]>();
  for (const [x, y] of line.links) {
    const [a, b] = x < y ? [x, y] : [y, x];
    const g = tracks[`${line.id}|${a}|${b}`];
    if (!g) continue;
    (ends.get(a) ?? ends.set(a, []).get(a)!).push(g[0]);
    (ends.get(b) ?? ends.set(b, []).get(b)!).push(g[g.length - 1]);
  }
  for (const pts of ends.values()) {
    let worst = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) worst = Math.max(worst, distance(pts[i], pts[j]));
    if (pts.length > 1) gaps.push(worst);
  }
}
gaps.sort((p, q) => p - q);
const pct = (p: number) => Math.round(gaps[Math.floor(gaps.length * p)]);
console.log(`stations with 2+ links: ${gaps.length}`);
console.log(`gap between link ends at a station: median ${pct(0.5)} m, p90 ${pct(0.9)} m, p99 ${pct(0.99)} m, max ${Math.round(gaps.at(-1)!)} m`);
console.log(`over 30 m: ${gaps.filter((g) => g > 30).length}, over 100 m: ${gaps.filter((g) => g > 100).length}`);
