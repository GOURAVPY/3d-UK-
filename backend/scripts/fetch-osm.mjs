// One-off: download London rail track geometry from OpenStreetMap (Overpass API).
// Output: data/raw/osm-rail.json (git-ignored, large). Then run build-tracks.ts.
import { mkdirSync, writeFileSync } from "node:fs";

const BBOX = "51.28,-0.58,51.72,0.36"; // south,west,north,east: Greater London
const QUERY = `[out:json][timeout:240];
way["railway"~"^(subway|rail|light_rail)$"]["service"!~"."](${BBOX});
out geom;`;
const SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

for (const server of SERVERS) {
  try {
    console.log("trying", server);
    const res = await fetch(server, {
      method: "POST",
      headers: {
        "User-Agent": "live-city-3d-student-project/0.1",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "data=" + encodeURIComponent(QUERY),
      signal: AbortSignal.timeout(280_000),
    });
    const text = await res.text();
    if (!res.ok || !text.startsWith("{")) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    const json = JSON.parse(text);
    mkdirSync("data/raw", { recursive: true });
    writeFileSync("data/raw/osm-rail.json", text);
    console.log(`ok: ${json.elements.length} ways, ${(text.length / 1e6).toFixed(1)} MB from ${server}`);
    process.exit(0);
  } catch (err) {
    console.log("failed:", err.message);
  }
}
console.log("all servers failed");
process.exit(1);
