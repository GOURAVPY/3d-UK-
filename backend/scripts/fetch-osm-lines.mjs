// One-off: download the route relation of every London rail line from OpenStreetMap, so
// each line can be matched to its own track (the generic ways file has no line names).
// Output: data/raw/osm-lines.json (git-ignored).
import { mkdirSync, writeFileSync } from "node:fs";

const BBOX = "51.28,-0.58,51.72,0.36";
const NAMES =
  "^(Bakerloo|Central|Circle|District|Hammersmith & City|Jubilee|Metropolitan|Northern|Piccadilly|Victoria|Waterloo & City|Elizabeth|Liberty|Lioness|Mildmay|Suffragette|Weaver|Windrush) line|^DLR|^Docklands Light Railway";
const QUERY = `[out:json][timeout:240];
rel["route"~"^(subway|train|light_rail)$"]["name"~"${NAMES}"](${BBOX});
out geom;`;
const SERVERS = [
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
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
    if (!res.ok || !text.startsWith("{")) throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
    const json = JSON.parse(text);
    mkdirSync("data/raw", { recursive: true });
    writeFileSync("data/raw/osm-lines.json", text);
    console.log(`ok: ${json.elements.length} relations, ${(text.length / 1e6).toFixed(1)} MB from ${server}`);
    process.exit(0);
  } catch (err) {
    console.log("failed:", err.message);
  }
}
console.log("all servers failed");
process.exit(1);
