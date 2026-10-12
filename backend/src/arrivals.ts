import { tfl } from "./tfl.js";
import type { Line } from "./lines.js";

export interface Train {
  id: string; // lineId:vehicleId
  lineId: string;
  lineName: string;
  colour: string;
  nextStationId: string;
  nextStation: string;
  destination: string;
  platform: string;
  currentLocation: string;
  secondsToNext: number;
  expectedArrival: string;
  lat: number;
  lon: number;
}

interface Prediction {
  vehicleId: string;
  lineId: string;
  naptanId: string;
  stationName: string;
  destinationName?: string;
  platformName: string;
  currentLocation: string;
  timeToStation: number;
  expectedArrival: string;
}

// One request per line. The same train appears in many stations' predictions,
// so group by line + vehicle and keep the soonest arrival.
export async function fetchTrains(lines: Line[]): Promise<Train[]> {
  const stationById = new Map(lines.flatMap((l) => l.stations.map((s) => [s.id, s] as const)));
  const results = await Promise.allSettled(
    lines.map((l) => tfl<Prediction[]>(`/Line/${l.id}/Arrivals`)),
  );
  const trains: Train[] = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const line = lines[i];
    const soonest = new Map<string, Prediction>();
    for (const p of r.value) {
      const key = p.vehicleId;
      const best = soonest.get(key);
      if (!best || p.timeToStation < best.timeToStation) soonest.set(key, p);
    }
    for (const p of soonest.values()) {
      const st = stationById.get(p.naptanId);
      if (!st) continue; // no coordinates for this stop
      trains.push({
        id: `${line.id}:${p.vehicleId}`,
        lineId: line.id,
        lineName: line.name,
        colour: line.colour,
        nextStationId: p.naptanId,
        nextStation: p.stationName,
        destination: p.destinationName ?? "",
        platform: p.platformName,
        currentLocation: p.currentLocation,
        secondsToNext: p.timeToStation,
        expectedArrival: p.expectedArrival,
        lat: st.lat,
        lon: st.lon,
      });
    }
  });
  return trains;
}
