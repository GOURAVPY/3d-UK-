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

## Lanes (Mini Tokyo style)
1. Offline: `scripts/build-lanes.ts` finds links of different lines that run alongside each other and writes `data/lanes.json`, a lane offset (in lane units, to the left of the link's stored direction) for each shared link.
2. Browser: `laneSpacingMetres(zoom)` turns a lane unit into metres (12 px on screen, at least 14 m). Lines are drawn shifted by that amount; trains add the same offset per carriage plus a quarter lane to the left of travel.
3. Between neighbouring links the lane eases over up to 150 m, as Mini Tokyo blends its offset sublines.

## Day and night
1. `sunElevation(date)` gives the sun's height over London; `isNight` is true below -1.5 degrees. A clock in the app re-checks every 30 s.
2. The theme (Auto, Day, Night) picks the base map style. Changing it calls `map.setStyle`, and every `style.load` rebuilds our buildings, lanes, stations, trains and planes in the right look.
3. Night values live next to the code that draws them: building colours, lane glow, station dots, `liftDark` for very dark lines, and lighting plus lit windows in the train and plane layers.

## Underground, surface, elevated
1. Offline: `scripts/build-levels.ts` classifies every stretch of every link from OpenStreetMap tunnel, bridge and layer tags and writes `data/levels.json`.
2. Browser: `TrackIndex` turns the runs into a level profile per chain (`levelAt`) and splits every drawn link into one feature per level. Map layers: dashed faint (underground), casing plus lane (elevated), glow plus lane (surface).
3. Trains: each carriage looks up the level at its own centre. Underground carriages go into the ghost meshes (transparent) and sit lower; elevated carriages sit higher.
4. Waiting trains (d0 = 0) are queued behind their station on the server (`queueWaitingTrains`).

## Alerts, history and replay
- **Status:** server polls `/Line/Mode/.../Status` every 2 min and emits `status`; the browser lights the line's halo and the alert pill.
- **Stops:** `stopsFor(trainId)` returns the upcoming stops from the last poll for the timeline panel.
- **History:** each poll is appended to `data/history.jsonl` as numbers only; an in-memory index of (time, offset, length) lets `GET /api/history` read slices. Trimmed to 24 h.
- **Replay:** the browser fetches 20 minute windows, advances a virtual clock 60x faster than real time, and feeds the snapshot at or before it to the train layer with a 0.5 s glide.

## Underground Mode
1. Offline: `fetch-osm-stations.mjs` then `build-stations.ts` write `data/station-layout.json` (only features within 260 m of a station).
2. Browser: `underground.ts` adds five hidden layers (station area, platform polygon, platform line, passage, entrance) below the lines. `setUndergroundMode` shows them and changes the paint of the buildings, surface lanes, tunnel lanes and stations; the train layer draws underground trains solid.

## Display modes
- **Underground:** `undergroundMode` in the train layer decides which carriages are ghosts (above ground when on, below when off); `flights.setUnderground` makes aircraft translucent; `setUndergroundMode` changes the map layers. Clicking or following a train sets it from `levelOf(trainId)`.
- **Eco:** `setEco` makes both 3D layers wait 125 ms between redraws.
- **Playback:** `ReplayBar` steps speed 1..600, edits the date and time in London time, and hides aircraft.
- **Full screen:** the browser Fullscreen API.
