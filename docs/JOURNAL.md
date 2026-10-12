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
