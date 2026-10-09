# Logic

## Data flow
```
TfL API  ->  backend (Express)  ->  WebSocket  ->  browser (React + MapLibre + Three.js)
 once at startup: stations + track          every 30 s: arrivals -> train positions
```
The browser never talks to TfL. The key stays in `backend/.env`.

## Built (Week 1)
1. On startup the backend calls `/Line/Mode/tube,dlr,elizabeth-line,overground`.
2. For each line it calls `/Line/{id}/Route/Sequence/outbound` and `inbound`.
   - `lineStrings` -> track paths (lists of `[lon, lat]`), deduplicated.
   - `stopPointSequences` -> stations (id, name, lat, lon), deduplicated.
3. Colours come from `lineColours.ts` (TfL's API has none).
4. `GET /api/lines` returns everything. The frontend draws paths as a line layer and stations as circles.

## Planned: train positions (Weeks 2–3)
TfL gives arrival predictions, not GPS, so we estimate.
1. Every 30 s fetch `/Line/{id}/Arrivals` per line (about 19 requests, far under 500/min).
2. Group predictions by `vehicleId` + `lineId`. The same train appears in many stations' lists.
3. Keep the prediction with the smallest `timeToStation`. That is the train's next station.
4. `currentLocation` ("Between A and B") gives the previous station.
5. Find the track segment between previous and next station.
6. Progress = 1 − timeLeft / segmentTime. Example: 2 min trip, 30 s left -> 0.75 along.
7. Place the train at that fraction along the polyline.
8. Send all trains over the WebSocket. The browser eases each train to its new spot 60 times a second.

Edge cases to handle: `currentLocation` is "At Station" or "Approaching"; a train disappears from the feed; a branch (two possible paths); 429 rate limit (back off).
