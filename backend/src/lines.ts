import { existsSync, readFileSync } from "node:fs";
import { LINE_COLOURS } from "./lineColours.js";
import { tfl } from "./tfl.js";

export type LngLat = [number, number];
export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
}
export interface Line {
  id: string;
  name: string;
  mode: string;
  colour: string;
  paths: LngLat[][];
  stations: Station[];
  // neighbouring stations in running order, used to find the station behind a train
  links: [string, string][];
}

const MODES = "tube,dlr,elizabeth-line,overground";

interface Sequence {
  lineStrings: string[];
  stopPointSequences: { stopPoint: (Station & { name: string })[] }[];
}

async function loadLine(id: string, name: string, mode: string): Promise<Line> {
  const paths = new Map<string, LngLat[]>();
  const stations = new Map<string, Station>();
  const links = new Map<string, [string, string]>();
  for (const dir of ["outbound", "inbound"]) {
    const seq = await tfl<Sequence>(`/Line/${id}/Route/Sequence/${dir}`);
    // each lineString is a JSON string holding a list of paths
    for (const s of seq.lineStrings) {
      for (const path of JSON.parse(s) as LngLat[][]) paths.set(JSON.stringify(path), path);
    }
    for (const group of seq.stopPointSequences) {
      for (let i = 1; i < group.stopPoint.length; i++) {
        const a = group.stopPoint[i - 1].id,
          b = group.stopPoint[i].id;
        links.set([a, b].sort().join("|"), [a, b]);
      }
      for (const sp of group.stopPoint) {
        stations.set(sp.id, { id: sp.id, name: sp.name, lat: sp.lat, lon: sp.lon });
      }
    }
  }
  return {
    id,
    name,
    mode,
    colour: LINE_COLOURS[id] ?? "#888888",
    paths: [...paths.values()],
    stations: [...stations.values()],
    links: [...links.values()],
  };
}

export async function loadAllLines(): Promise<Line[]> {
  const list = await tfl<{ id: string; name: string; modeName: string }[]>(`/Line/Mode/${MODES}`);
  return Promise.all(list.map((l) => loadLine(l.id, l.name, l.modeName)));
}

// Real track shapes built by scripts/build-tracks.ts. Without the file we keep TfL's coarse paths.
export function loadTrackFile(file = "data/tracks.json"): Record<string, LngLat[]> {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, LngLat[]>) : {};
}

export function applyTracks(lines: Line[], tracks: Record<string, LngLat[]>): number {
  let used = 0;
  for (const line of lines) {
    const at = new Map(line.stations.map((s) => [s.id, [s.lon, s.lat] as LngLat]));
    const paths: LngLat[][] = [];
    for (const [x, y] of line.links) {
      const key = x < y ? `${line.id}|${x}|${y}` : `${line.id}|${y}|${x}`;
      const geom = tracks[key];
      if (geom) {
        paths.push(x < y ? geom : [...geom].reverse());
        used++;
      } else if (at.has(x) && at.has(y)) {
        paths.push([at.get(x)!, at.get(y)!]);
      }
    }
    if (paths.length) line.paths = paths;
  }
  return used;
}
