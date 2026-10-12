import { tfl } from "./tfl.js";
import type { Line } from "./lines.js";
import type { LineTracks } from "./positioning.js";

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
  lat: number; // estimated position now
  lon: number;
  toLat: number; // where it will be after `horizonS` seconds
  toLon: number;
  heading: number; // compass degrees, 0 = north
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
// so group by vehicle: its soonest prediction is the next stop, the one after
// that tells us which way it is heading.
export async function fetchTrains(
  lines: Line[],
  tracks: Map<string, LineTracks>,
  horizonS: number,
): Promise<Train[]> {
  const results = await Promise.allSettled(
    lines.map((l) => tfl<Prediction[]>(`/Line/${l.id}/Arrivals`)),
  );
  const trains: Train[] = [];
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const line = lines[i];
    const lt = tracks.get(line.id)!;
    const byVehicle = new Map<string, Prediction[]>();
    for (const p of r.value) {
      // DLR predictions have no vehicleId, so those trains cannot be told apart
      if (!p.vehicleId) continue;
      if (!byVehicle.has(p.vehicleId)) byVehicle.set(p.vehicleId, []);
      byVehicle.get(p.vehicleId)!.push(p);
    }
    for (const [vehicleId, preds] of byVehicle) {
      preds.sort((a, b) => a.timeToStation - b.timeToStation);
      const next = preds[0];
      const at = lt.station(next.naptanId);
      if (!at) continue; // no coordinates for this stop

      let pos = at;
      let soon = at;
      let heading = 0;
      const prev = lt.prevStation(next.naptanId, preds[1]?.naptanId, next.currentLocation);
      const track = prev ? lt.trackBetween(prev, next.naptanId) : null;
      if (track) {
        pos = lt.positionAt(track, next.timeToStation);
        soon = lt.positionAt(track, next.timeToStation - horizonS);
        heading = lt.headingAt(track, next.timeToStation);
      }
      trains.push({
        id: `${line.id}:${vehicleId}`,
        lineId: line.id,
        lineName: line.name,
        colour: line.colour,
        nextStationId: next.naptanId,
        nextStation: next.stationName,
        destination: next.destinationName ?? "",
        platform: next.platformName,
        currentLocation: next.currentLocation,
        secondsToNext: next.timeToStation,
        expectedArrival: next.expectedArrival,
        lat: pos[1],
        lon: pos[0],
        toLat: soon[1],
        toLon: soon[0],
        heading,
      });
    }
  });
  return trains;
}
