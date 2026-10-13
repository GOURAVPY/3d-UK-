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

## Week 4 — Train panel, follow camera, departures board ✅ (2026-10-12)
**Goal:** click a train for details, follow mode, station departures board.
**Done:**
- Click a train: panel with line, destination, next station, arrival, platform, location.
- Follow mode: camera rides with the train, turns to its heading, stops when you drag.
- Click a station: live departures board (15 s refresh, server cache).
- Extras earlier: airport shortcuts and live streams list; 3D six-carriage trains; real track shapes from OpenStreetMap; zoom and colour fixes.
**Not done / limits:** not tested on a real phone; no DLR trains; positions are estimates.
**Numbers:** about 680 trains, 3 new endpoints/components (departures API, train panel, station board).
**Lessons:** a custom 3D layer needs its own picking; project positions to screen and take the nearest.
**Next week:** Week 5 below.

## Week 5 — Day/night, delay alerts, replay, phone polish ✅ (2026-10-12)
**Goal:** lighting by London time, service status alerts, 24 h replay at 60x, mobile.
**Done:**
- Day and night by real sunset in London, dark Mini Tokyo style glowing lanes, theme button, London clock.
- Delay alerts from TfL service status: pill, halo on the line, TfL's reason text.
- Replay: every poll recorded for 24 h, played back at 60x with a scrubber.
- Phone polish: lighter map, bigger tap targets, no overlaps in the emulator.
- Extras: Mini Tokyo style train panel with a timeline of stops; underground / surface / elevated styling; lanes for shared corridors; queued waiting trains.
**Not done / limits:** replay is as long as the server has been running; not tried on a real phone; no DLR trains.
**Next week:** Week 6 below.

## Week 6 — Demo, write-up, launch 🟡 (2026-10-13)
**Goal:** 30 s demo video, write-up on how arrival times become positions, publish. Second city after launch.
**Done:**
- Demo video, 61 s: rush hour at 60x, follow a train, aircraft at Heathrow (`docs/demo/demo.mp4`, re-recordable by script).
- Write-up: `docs/HOW-IT-WORKS.md`.
- Deploy config for Vercel (frontend) and Render (backend).
**Not done:** the actual launch needs the owner's Vercel and Render accounts; second city.
