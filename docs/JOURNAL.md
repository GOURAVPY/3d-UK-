# Journal

Newest entries at the bottom. Times are local, taken from the git history.
Template for a new entry: date, time span, what we did, problems, decisions, next.

## 2026-10-09 — Day 1 (Week 1)

### 14:12 — Repo set up
- Linked the GitHub repo `https://github.com/GOURAVPY/3d-UK-.git`, branch `main`.
- First commit, `CLAUDE.md` with the rule "commit every ~5 lines", and empty backend/frontend folders.

### After 14:12 — Research (no code)
- Read the project brief (Live City in 3D, London first).
- Checked the TfL API against its official endpoints. Confirmed:
  - `/Line/{id}/Arrivals` gives `vehicleId`, `naptanId`, `timeToStation` (seconds), `currentLocation` ("Between X and Y"), `platformName`, `expectedArrival`.
  - Rate limit: 500 requests per minute (portal FAQ).
  - An invalid key returns HTTP 429, not 401, so a 429 can mean a bad key.
- Chose map tools: MapLibre GL JS with a Three.js custom layer for trains (later), `fill-extrusion` for buildings.

### 19:32 — API key
- Got primary and secondary TfL keys (two keys for one subscription, for rotation).
- Keys live only in `backend/.env`, which git ignores. `.env.example` is committed.
- Tested all three endpoints with the key: HTTP 200 for each. The secondary key also works.

### 19:51–19:55 — Built Week 1
- Backend: Express + TypeScript, loads all lines at startup, serves `/api/lines` and `/api/health`. 19 lines loaded.
- Frontend: Vite + React + TypeScript, MapLibre map centred on London, lines in real colours, station dots, line key.
- 15 small commits, each one file or step.

### Problems and fixes
| Problem | Cause | Fix |
|---|---|---|
| Map stayed blank, "Worker failed to load" | Vite pre-bundled maplibre-gl and broke its worker file path | `optimizeDeps: { exclude: ["maplibre-gl"] }` in `vite.config.ts` |
| TypeScript: no default export from maplibre-gl | This version has only named exports | `import * as maplibregl` |
| Old Vite kept serving after config change | `pkill` does not work on Windows | Restart by port with PowerShell |
| Folder layout changed under us | `structure/` was replaced by root `backend/` and `frontend/` | Committed the new layout, removed `structure/` |

### Decisions
- Keep Week 1 flat (no 3D), as the plan says.
- Track is drawn straight between stations where TfL gives no detailed path (Elizabeth, Liberty, Lioness). Acceptable for now.
- The browser never calls TfL. Only our server does, so the key stays hidden.

### Next
Week 2: 3D buildings, server polls arrivals every 30 s, trains as dots at stations.

## 2026-10-12 — Day 2 (Week 2)

### What we did
- Backend: added Socket.io. New `arrivals.ts` fetches `/Line/{id}/Arrivals` for every line, groups predictions by `vehicleId` and keeps the soonest one per train.
- Server polls every 30 s, pushes `trains` to all browsers, and serves `GET /api/trains`. New browsers get the latest list on connect.
- Frontend: 3D buildings (`fill-extrusion` from the OpenFreeMap `building` layer), tilted camera (pitch 55), live train dots at each train's next station, live counter.
- Result: about 820 trains on the first poll, 829 in the browser.

### Problems and fixes
| Problem | Cause | Fix |
|---|---|---|
| DLR showed 1 train | DLR predictions have an empty `vehicleId`, so all collapsed to one key | Skip predictions with no `vehicleId`. DLR has no trains until we find another source |
| Buildings looked flat | Pale colour, and shown only from zoom 13 | Colour by height. Zoom in to see them |

### Decisions
- Trains sit at their next station for now. Real positions between stations come in Week 3.
- Browser gets trains over a WebSocket (via Vite proxy), never from TfL.

### Known limits
- No DLR trains (no vehicle ids in the feed).
- Elizabeth line count (about 128) looks high. Check in Week 3 whether vehicle ids repeat.

### Next
Week 3: estimate each train's position between stations and animate smoothly.

## 2026-10-12 — Day 3 (Week 3)

### What we did
- Backend: each line now keeps ordered neighbour links (`links`) from TfL's stop sequences.
- New `geo.ts` (distance, track length, point along a track) and `positioning.ts` (`LineTracks`).
- For each train: next stop = soonest prediction; station behind it = the neighbour of the next stop that is not the stop after it; track = shortest stretch of any line path touching both; position = next stop minus `timeToStation x speed`, capped at the track length.
- Server sends two points per train: where it is now and where it will be in 30 s.
- Frontend: `trains.ts` glides each train from its drawn position to its target over 30 s, redrawn every animation frame. New data starts from the drawn spot, so nothing jumps.

### Results (first measured poll)
- 807 trains: 507 moving, 300 waiting at a station, 0 left stuck on their next station.
- Median movement 330 m per 30 s.

### Problems and fixes
| Problem | Cause | Fix |
|---|---|---|
| 46 trains stuck on their next station | At a terminus the stop after the next is the same neighbour the train came from, so excluding it left no previous station | If excluding leaves none, keep that neighbour |
| `currentLocation` empty for Elizabeth/Overground | TfL leaves it blank there | Do not rely on the text. Use stop order from the stop sequences |

### Decisions
- Average speed is a guess per mode: tube 11, DLR 9, Elizabeth 17, Overground 14 m/s. Tune in `positioning.ts`.
- Track is cut from the line paths where a path touches both stations. Otherwise a straight line is used.
- Updating the map source each frame is fine for about 800 trains. Move to an `InstancedMesh` if it gets slow.

### Known limits
- Positions are estimates, not GPS. Dwell time at stations is not modelled, so some trains wait at the previous station until their arrival gets close.
- Trains whose next stop is far away are placed at the previous station.
- Still no DLR.

### Next
Week 4: click a train for details, follow camera, station departures board.
