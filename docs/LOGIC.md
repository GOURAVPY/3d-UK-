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
4. Track = the real track shape for that station link from `data/tracks.json` (built offline from OpenStreetMap), or a straight line if the link has none.
5. Remaining distance = min(timeToStation x speed, track length).
6. Position = point on the track that far behind the next stop. Speed is a per-mode guess (tube 11, DLR 9, Elizabeth 17, Overground 14 m/s).
7. Do the same with `timeToStation - 30` for where the train will be one poll later.
8. Send the station chain (before, from, to, after) and the distances d0 and d1 along the from-to link, plus the heading. The browser builds one run of real track from the chain (cutting any overshoot where two links join), slides the train along it over 30 s, and places each of the six carriages on its own stretch of that track, so the train bends round curves (`frontend/src/tracks.ts`, `frontend/src/trains.ts`).

Edge cases still open: dwell time at stations, trains with a far-off next stop sit at the previous station, branches with two possible previous stations (name hint used), 429 rate limit (back off), no DLR vehicle ids.

## Live streams (extra)
Third-party streams are a static list in `frontend/src/data/streams.ts`, not part of the TfL data flow. Entries link out, or embed in the page when a `youtubeId` is set. Street traffic cameras were removed.

## Track data pipeline (offline, run once)
1. `node scripts/fetch-osm-lines.mjs` downloads each line's OpenStreetMap route relations to `data/raw/osm-lines.json` (git-ignored). `node scripts/fetch-osm.mjs` downloads all London rail ways as a fallback for lines without a relation.
2. `npx tsx scripts/build-tracks.ts` builds one graph per line from that line's own ways and routes every station link with A*, writing `data/tracks.json` keyed `lineId|stationA|stationB`. A station keeps one track node shared by the links either side of it.
3. `npx tsx scripts/check-joins.ts` reports how far apart link ends are at stations; `node scripts/check-kinks.mjs` (server running) reports the sharpest bend under each live train.
4. The server reads `data/tracks.json` at startup and serves it at `/api/tracks`. Re-run when TfL adds stations.

## Aircraft
1. Server: every 10 s `fetchFlights()` asks `api.adsb.lol/v2/point/51.5/-0.1/70`, keeps aircraft with a position, converts feet to metres and knots to m/s, and emits `flights`.
2. Browser: `flights.ts` keeps each plane's last report (position, altitude, velocity vector) and draws it dead-reckoned between reports, easing any correction in over 2.5 s.
3. Drawing: two instanced meshes (body, tail) plus a shadow; heading, pitch from climb rate, bank from roll.
