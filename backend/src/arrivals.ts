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
  // Stations the train runs along: [before?, from, to, after?]. `fromIndex` is the index of `from`.
  // d0/d1 are metres from `from` towards `to` now and one poll later.
  ids: string[];
  fromIndex: number;
  d0: number;
  d1: number;
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

// Overground and Elizabeth line predictions include services that have not left their depot
// or terminus yet (next stop up to two hours away). Those are timetable entries, not trains
// on the line, and they pile up at the stations. No real train is further than this from its
// next stop.
const MAX_RUNNING_S = 15 * 60;

// A train about to arrive somewhere then not reaching its following stop for over this long
// is not a train in service: its first prediction is a leftover from the timetable (eight
// Elizabeth line trips all said "Heathrow Terminal 4 in 3 seconds" and "Terminals 2 and 3
// in 38 minutes"). Real trains are never this far apart from one stop to the next.
const MAX_GAP_S = 20 * 60;

export interface Stop {
  id: string;
  name: string;
  seconds: number;
  expectedArrival: string;
}

// Trains of each line from the last poll that reached TfL, so a line whose request fails
// this time keeps its trains instead of blinking out for 30 s.
const lastByLine = new Map<string, Train[]>();

// Upcoming stops of every train from the last poll, keyed by train id.
let stopsByTrain = new Map<string, Stop[]>();
export function stopsFor(trainId: string): Stop[] | undefined {
  return stopsByTrain.get(trainId);
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
  if (results.every((r) => r.status === "rejected")) {
    throw new Error(`TfL unreachable: ${(results[0] as PromiseRejectedResult).reason}`);
  }
  const trains: Train[] = [];
  const stops = new Map<string, Stop[]>();
  results.forEach((r, i) => {
    const line = lines[i];
    if (r.status !== "fulfilled") {
      trains.push(...(lastByLine.get(line.id) ?? []));
      return;
    }
    const lineTrains: Train[] = [];
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
      if (next.timeToStation > MAX_RUNNING_S) continue; // scheduled, not running yet
      if (preds[1] && preds[1].timeToStation - next.timeToStation > MAX_GAP_S) continue; // stale first prediction
      const at = lt.station(next.naptanId);
      if (!at) continue; // no coordinates for this stop

      let pos = at;
      let soon = at;
      let heading = 0;
      let ids = [next.naptanId];
      let fromIndex = 0;
      let d0 = 0;
      let d1 = 0;
      const prev = lt.prevStation(next.naptanId, preds[1]?.naptanId, next.currentLocation);
      const track = prev ? lt.trackBetween(prev, next.naptanId) : null;
      if (track) {
        pos = lt.positionAt(track, next.timeToStation);
        soon = lt.positionAt(track, next.timeToStation - horizonS);
        heading = lt.headingAt(track, next.timeToStation);
        d0 = lt.alongAt(track, next.timeToStation);
        d1 = lt.alongAt(track, next.timeToStation - horizonS);
        // stations either side, so the rear and front carriages have track under them
        ids = [prev!, next.naptanId];
        const before = lt.neighbours(prev!).filter((n) => n !== next.naptanId);
        if (before.length === 1) {
          ids.unshift(before[0]);
          fromIndex = 1;
        }
        const following = preds[1]?.naptanId;
        const ahead = lt.neighbours(next.naptanId).filter((n) => n !== prev);
        const after = following && ahead.includes(following) ? following : ahead.length === 1 ? ahead[0] : null;
        if (after) ids.push(after);
      }
      const seenStops = new Set<string>();
      stops.set(
        `${line.id}:${vehicleId}`,
        preds
          .filter((p) => !seenStops.has(p.naptanId) && !!seenStops.add(p.naptanId))
          .slice(0, 16)
          .map((p) => ({
            id: p.naptanId,
            name: p.stationName,
            seconds: p.timeToStation,
            expectedArrival: p.expectedArrival,
          })),
      );
      lineTrains.push({
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
        ids,
        fromIndex,
        d0,
        d1,
      });
    }
    lastByLine.set(line.id, lineTrains);
    trains.push(...lineTrains);
  });
  queueWaitingTrains(trains);
  stopsByTrain = stops;
  return trains;
}

// Trains whose next arrival is far off are placed at the station they just left, so several
// can end up on exactly the same spot. Line them up behind the platform instead, soonest
// departure at the front, one train length apart.
const QUEUE_GAP_M = 105;
const MAX_QUEUED = 6;

function queueWaitingTrains(trains: Train[]): void {
  const waiting = new Map<string, Train[]>();
  for (const t of trains) {
    if (t.ids.length < 2 || t.d0 > 0.5) continue; // moving, or no track under it
    const key = t.ids[t.fromIndex]; // everything leaving this station shares its approach
    if (!waiting.has(key)) waiting.set(key, []);
    waiting.get(key)!.push(t);
  }
  for (const group of waiting.values()) {
    group.sort((x, y) => x.secondsToNext - y.secondsToNext);
    group.forEach((t, k) => {
      const back = (k % MAX_QUEUED) * QUEUE_GAP_M;
      t.d0 -= back;
      t.d1 -= back;
    });
  }
}
