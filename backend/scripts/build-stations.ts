// One-off: turn the raw OpenStreetMap download into a compact layout of every station
// we draw, for Underground Mode.
//
// Input:  data/raw/osm-stations.json (fetch-osm-stations.mjs) + live TfL stations
// Output: data/station-layout.json, a GeoJSON FeatureCollection whose features carry
//         properties.k = "station" | "platform" | "passage" | "entrance"
import { readFileSync, writeFileSync } from "node:fs";
import { distance } from "../src/geo.js";
import { loadAllLines, type LngLat } from "../src/lines.js";

interface El {
  type: "way" | "node";
  id: number;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

const NEAR_M = 260; // keep only what is within this distance of a station we draw
const round = (n: number) => Math.round(n * 1e6) / 1e6;

// TfL is asked first; if it is having a bad moment, the running local server has the same list.
async function stationList() {
  try {
    return await loadAllLines();
  } catch (err) {
    console.log("TfL unavailable (" + (err instanceof Error ? err.message : err) + "), using the local server");
    return (await (await fetch("http://localhost:3001/api/lines")).json()) as Awaited<ReturnType<typeof loadAllLines>>;
  }
}
const lines = await stationList();
const stations: LngLat[] = [
  ...new Map(lines.flatMap((l) => l.stations).map((s) => [s.id, [s.lon, s.lat] as LngLat])).values(),
];
console.log(`${stations.length} stations`);

// grid of stations so "is this near a station" is cheap
const CELL = 0.004;
const grid = new Map<string, LngLat[]>();
for (const s of stations) {
  const k = `${Math.floor(s[0] / CELL)},${Math.floor(s[1] / CELL)}`;
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k)!.push(s);
}
function nearStation(p: LngLat): boolean {
  const cx = Math.floor(p[0] / CELL);
  const cy = Math.floor(p[1] / CELL);
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (const s of grid.get(`${x},${y}`) ?? []) if (distance(s, p) <= NEAR_M) return true;
    }
  }
  return false;
}

const els = JSON.parse(readFileSync("data/raw/osm-stations.json", "utf8")) as El[];
console.log(`${els.length} raw elements`);

type Kind = "station" | "platform" | "passage" | "entrance";
const features: unknown[] = [];
const count: Record<string, number> = {};

function classify(t: Record<string, string>): Kind | null {
  if (t.railway === "platform" || t.public_transport === "platform") return "platform";
  if (t.railway === "station" || t.building === "train_station" || t.public_transport === "station") return "station";
  if (t.highway === "corridor" || t.indoor === "corridor") return "passage";
  if (["footway", "steps", "pedestrian", "path"].includes(t.highway) && ["yes", "building_passage"].includes(t.tunnel)) {
    return "passage";
  }
  if (t.indoor === "room" || t.indoor === "area") return "station";
  return null;
}

for (const el of els) {
  const t = el.tags ?? {};
  if (el.type === "node") {
    if (t.railway !== "subway_entrance" || el.lat === undefined || el.lon === undefined) continue;
    const p: LngLat = [el.lon, el.lat];
    if (!nearStation(p)) continue;
    features.push({ type: "Feature", properties: { k: "entrance" }, geometry: { type: "Point", coordinates: [round(p[0]), round(p[1])] } });
    count.entrance = (count.entrance ?? 0) + 1;
    continue;
  }
  const kind = classify(t);
  if (!kind || !el.geometry || el.geometry.length < 2) continue;
  const pts = el.geometry.map((g) => [round(g.lon), round(g.lat)] as LngLat);
  const mid = pts[Math.floor(pts.length / 2)];
  if (!nearStation(mid) && !nearStation(pts[0])) continue;
  const closed =
    pts.length >= 4 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  const asArea = closed && (kind === "station" || kind === "platform");
  features.push({
    type: "Feature",
    properties: { k: kind },
    geometry: asArea
      ? { type: "Polygon", coordinates: [pts] }
      : { type: "LineString", coordinates: pts },
  });
  const label = asArea ? kind : kind === "passage" ? "passage" : `${kind} (line)`;
  count[label] = (count[label] ?? 0) + 1;
}

writeFileSync("data/station-layout.json", JSON.stringify({ type: "FeatureCollection", features }));
console.log("kept:", count);
console.log(`features: ${features.length}`);
