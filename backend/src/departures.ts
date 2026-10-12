import { LINE_COLOURS } from "./lineColours.js";
import { tfl } from "./tfl.js";

export interface Departure {
  lineId: string;
  lineName: string;
  colour: string;
  destination: string;
  platform: string;
  seconds: number;
  currentLocation: string;
}

interface Prediction {
  lineId: string;
  lineName: string;
  destinationName?: string;
  towards?: string;
  platformName: string;
  timeToStation: number;
  currentLocation: string;
}

const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; rows: Departure[] }>();

// Live departures board for one station, soonest first. Cached briefly so many
// browsers watching the same station cost one TfL request.
export async function departuresFor(stationId: string): Promise<Departure[]> {
  const hit = cache.get(stationId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const preds = await tfl<Prediction[]>(`/StopPoint/${stationId}/Arrivals`);
  const rows = preds
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .slice(0, 14)
    .map((p) => ({
      lineId: p.lineId,
      lineName: p.lineName,
      colour: LINE_COLOURS[p.lineId] ?? "#888888",
      destination: p.destinationName ?? p.towards ?? "",
      platform: p.platformName,
      seconds: p.timeToStation,
      currentLocation: p.currentLocation,
    }));
  cache.set(stationId, { at: Date.now(), rows });
  return rows;
}
