import { LINE_COLOURS } from "./lineColours.js";
import { tfl } from "./tfl.js";

export type LngLat = [number, number];
export interface Station { id: string; name: string; lat: number; lon: number }
export interface Line {
  id: string;
  name: string;
  mode: string;
  colour: string;
  paths: LngLat[][];
  stations: Station[];
}

const MODES = "tube,dlr,elizabeth-line,overground";

interface Sequence {
  lineStrings: string[];
  stopPointSequences: { stopPoint: (Station & { name: string })[] }[];
}

async function loadLine(id: string, name: string, mode: string): Promise<Line> {
  const paths = new Map<string, LngLat[]>();
  const stations = new Map<string, Station>();
  for (const dir of ["outbound", "inbound"]) {
    const seq = await tfl<Sequence>(`/Line/${id}/Route/Sequence/${dir}`);
    // each lineString is a JSON string holding a list of paths
    for (const s of seq.lineStrings) {
      for (const path of JSON.parse(s) as LngLat[][]) paths.set(JSON.stringify(path), path);
    }
    for (const group of seq.stopPointSequences) {
      for (const sp of group.stopPoint) {
        stations.set(sp.id, { id: sp.id, name: sp.name, lat: sp.lat, lon: sp.lon });
      }
    }
  }
  return {
    id, name, mode,
    colour: LINE_COLOURS[id] ?? "#888888",
    paths: [...paths.values()],
    stations: [...stations.values()],
  };
}

export async function loadAllLines(): Promise<Line[]> {
  const list = await tfl<{ id: string; name: string; modeName: string }[]>(`/Line/Mode/${MODES}`);
  return Promise.all(list.map((l) => loadLine(l.id, l.name, l.modeName)));
}
