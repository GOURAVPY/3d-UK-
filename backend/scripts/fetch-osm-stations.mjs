// One-off: download station layouts from OpenStreetMap (Overpass): station buildings and
// areas, platforms, underground passages and corridors, and subway entrances.
// London is fetched in tiles so each request stays small enough for the public servers.
// Output: data/raw/osm-stations.json (git-ignored).
import { mkdirSync, writeFileSync } from "node:fs";

const SOUTH = 51.28, WEST = -0.58, NORTH = 51.72, EAST = 0.36;
const COLS = 3, ROWS = 3;
const SERVERS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const query = (s, w, n, e) => `[out:json][timeout:180];
(
  way["railway"="station"](${s},${w},${n},${e});
  way["building"="train_station"](${s},${w},${n},${e});
  way["public_transport"="station"](${s},${w},${n},${e});
  way["railway"="platform"](${s},${w},${n},${e});
  way["public_transport"="platform"](${s},${w},${n},${e});
  way["highway"~"^(footway|corridor|steps|pedestrian|path)$"]["tunnel"~"^(yes|building_passage)$"](${s},${w},${n},${e});
  way["highway"="corridor"](${s},${w},${n},${e});
  way["indoor"~"^(corridor|room|area)$"](${s},${w},${n},${e});
  node["railway"="subway_entrance"](${s},${w},${n},${e});
);
out geom;`;

async function run(q) {
  for (const server of SERVERS) {
    try {
      const res = await fetch(server, {
        method: "POST",
        headers: { "User-Agent": "live-city-3d-student-project/0.1", "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(200_000),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith("{")) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(text).elements;
    } catch (err) {
      console.log("  ", server.split("/")[2], "failed:", err.message);
    }
  }
  return null;
}

const all = new Map();
let failed = 0;
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const s = SOUTH + ((NORTH - SOUTH) * r) / ROWS;
    const n = SOUTH + ((NORTH - SOUTH) * (r + 1)) / ROWS;
    const w = WEST + ((EAST - WEST) * c) / COLS;
    const e = WEST + ((EAST - WEST) * (c + 1)) / COLS;
    const els = await run(query(s.toFixed(4), w.toFixed(4), n.toFixed(4), e.toFixed(4)));
    if (!els) {
      failed++;
      console.log(`tile ${r},${c}: FAILED`);
      continue;
    }
    for (const el of els) all.set(`${el.type}${el.id}`, el);
    console.log(`tile ${r},${c}: ${els.length} elements (total ${all.size})`);
  }
}
mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/osm-stations.json", JSON.stringify([...all.values()]));
console.log(`done: ${all.size} elements, ${failed} tiles failed`);
process.exit(failed === COLS * ROWS ? 1 : 0);
