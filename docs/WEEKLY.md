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

## Week 2 — 3D map and live arrivals ⬜
**Goal:** 3D buildings; server polls arrivals every 30 s; trains shown as dots at stations.
**Done:**
**Not done:**
**Lessons:**

## Week 3 — Position estimate and smooth movement ⬜
**Goal:** estimate where each train is between stations; animate smoothly.

## Week 4 — Train panel, follow camera, departures board ⬜
**Goal:** click a train for details, follow mode, station departures board.

## Week 5 — Day/night, delay alerts, replay, phone polish ⬜
**Goal:** lighting by London time, service status alerts, 24 h replay at 60x, mobile.

## Week 6 — Demo, write-up, launch ⬜
**Goal:** 30 s demo video, write-up on how arrival times become positions, publish. Second city after launch.
