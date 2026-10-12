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

## Built (Week 2)
Steps 1–3 and 8 below are done: polling, grouping by vehicle, soonest prediction, WebSocket push. Trains are placed at their next station. Predictions with no `vehicleId` (DLR) are skipped.

## Built (Week 3): train positions
TfL gives arrival predictions, not GPS, so we estimate. Every 30 s:
1. Fetch `/Line/{id}/Arrivals` per line (19 requests, far under 500/min).
2. Group predictions by `vehicleId`. Sort each group by `timeToStation`. The first is the next stop, the second says which way it is heading.
3. Station behind the train = a neighbour of the next stop (from the line stop sequence) that is not the second stop. At a terminus the only neighbour is kept, because the train turns back.
4. Track = the shortest slice of any line path that touches both stations (straight line if none).
5. Remaining distance = min(timeToStation x speed, track length).
6. Position = point on the track that far behind the next stop. Speed is a per-mode guess (tube 11, DLR 9, Elizabeth 17, Overground 14 m/s).
7. Do the same with `timeToStation - 30` for where the train will be one poll later.
8. Send both points over the WebSocket. The browser glides each train from the spot it is drawn at to the new target over 30 s, every animation frame.

Edge cases still open: dwell time at stations, trains with a far-off next stop sit at the previous station, branches with two possible previous stations (name hint used), 429 rate limit (back off), no DLR vehicle ids.

## Live streams (extra)
Third-party streams are a static list in `frontend/src/data/streams.ts`, not part of the TfL data flow. Entries link out, or embed in the page when a `youtubeId` is set. Street traffic cameras were removed.
