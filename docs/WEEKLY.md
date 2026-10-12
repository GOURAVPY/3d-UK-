# Weekly record

Fill in each Friday. Status: ⬜ not started · 🟨 in progress · ✅ done

## Week 1 — Data and flat map ✅ (2026-10-09)
**Goal:** pick city, get key, load stations and track, draw lines on a flat map.
**Done:**
- City: London. TfL keys obtained and tested.
- Backend loads 19 lines (Tube, DLR, Elizabeth, Overground) with paths and stations.
- Frontend draws all lines in official colours with station dots and a line key.
**Not done / limits:** some lines drawn as straight segments; no live data yet.
**Numbers:** 19 lines, about 20 commits, 2 apps (backend, frontend).
**Lessons:** Vite breaks the MapLibre worker unless `maplibre-gl` is excluded from pre-bundling.
**Next week:** Week 2 below.

## Week 2 — 3D map and live arrivals ✅ (2026-10-12)
**Goal:** 3D buildings; server polls arrivals every 30 s; trains shown as dots at stations.
**Done:**
- Server polls TfL arrivals every 30 s and pushes trains over Socket.io; `GET /api/trains` too.
- Trains grouped by vehicle, soonest prediction kept, placed at the next station.
- 3D buildings, tilted camera, live train counter in the browser.
**Not done / limits:** trains jump station to station (no position between stations yet); no DLR trains; Elizabeth line count looks high.
**Numbers:** about 820 trains, 18 lines with trains, 19 requests per poll.
**Lessons:** DLR predictions have no vehicleId; check every line's data shape, not just one.
**Next week:** Week 3 below.

## Week 3 — Position estimate and smooth movement ✅ (2026-10-12)
**Goal:** estimate where each train is between stations; animate smoothly.
**Done:**
- Position estimate between stations from next stop, station behind it, track slice and time to arrival.
- Server sends now and 30 s ahead; browser glides each train between them every frame.
**Not done / limits:** speeds are guesses; dwell time not modelled; no DLR; map source redrawn per frame (InstancedMesh later if slow).
**Numbers:** 807 trains, 507 moving, 300 waiting at a station, median 330 m per 30 s.
**Lessons:** terminus turn-backs break "station behind" logic; the location text is blank on some lines.
**Next week:** Week 4 below.

## Week 4 — Train panel, follow camera, departures board 🟨
**Goal:** click a train for details, follow mode, station departures board.
**Done so far (extra, 2026-10-12):** airport shortcuts and a public live streams list. Street traffic cameras were built, then removed by request.
**Also done:** trains drawn as 3D instanced six-carriage models; zoom fix; real track shapes from OpenStreetMap (469 of 520 links).
**Still to do:** train panel (click a train), follow camera, station departures board.

## Week 5 — Day/night, delay alerts, replay, phone polish ⬜
**Goal:** lighting by London time, service status alerts, 24 h replay at 60x, mobile.

## Week 6 — Demo, write-up, launch ⬜
**Goal:** 30 s demo video, write-up on how arrival times become positions, publish. Second city after launch.
