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

## 2026-10-12 — Day 3, later: live cameras (extra, street cams removed)

### What we did
- Asked for live CCTV of trains and airports. Train/platform and terminal CCTV is private and not published by TfL, Network Rail or airports, so it is not possible.
- Built the two legitimate options:
  - TfL JamCams: 890 road traffic cameras (about 780 online), still image plus short clip, same API key. Backend `cameras.ts`, `GET /api/cameras`; frontend orange dots, click opens a panel with a live image that refreshes every 10 s and a "Play clip" button.
  - Public live streams (third party): `frontend/src/data/streams.ts`. Entries open the source page, or embed in the panel if a `youtubeId` is added.
- Tools box: traffic cams on/off, airport shortcuts (Heathrow, London City), live streams list.

### Problems and fixes
| Problem | Cause | Fix |
|---|---|---|
| Lines and trains took 10-15 s to appear | Layers were added on `load`, which waits for every tile | Add layers on `style.load` instead |
| Tools buttons overlapped the counter | Fixed offset too small | Moved down |

### Decisions
- Did not invent YouTube video ids. Streams entries link out until a verified id is added.
- Not every airport has TfL cameras nearby: Heathrow has about 15 within 5 km; Gatwick, Stansted and Luton are outside TfL's area.

### Known limits
- JamCams show roads near stations and airports, not the stations or platforms.
- Third-party streams are unofficial and can go offline.

### Update: street cameras removed
- Decision: street traffic cameras (TfL JamCams) removed at the owner's request. Deleted `backend/src/cameras.ts`, `/api/cameras`, the camera layer, panel, toggle and styles.
- Kept: airport shortcuts (Heathrow, London City) and the public live streams list.
- Fix found while cleaning up: `socket.io-client` was missing from the committed `frontend/package.json` since Week 2. Now committed, so a fresh clone builds.

## 2026-10-12 — Day 3, later: 3D trains and zoom fix

### What we did
- Trains are now real 3D boxes drawn with Three.js (one `InstancedMesh`, up to 3000) inside the map's own WebGL scene. Buildings hide trains correctly and they share one camera.
- Backend sends a `heading` per train (bearing of the track), so each box points along its track.
- Zoomed out, trains are drawn larger (about 22 px long) so they stay visible; zoomed in they shrink to real size (110 m x 3 m x 4 m).
- Initial zoom 13.2 so buildings show on load; minimum zoom 9.5.

### Problem: buildings vanish and trains stall when zooming
| Cause | Fix |
|---|---|
| Building data only exists in the map tiles from zoom 13, so zooming out below 13 cannot show buildings | Fade buildings in from 13 to 13.8, start at zoom 13.2 |
| Trains were redrawn by replacing a GeoJSON source every frame, which made the map's worker re-process data during zooms | Trains are now a custom 3D layer, no map data is touched per frame |
| Wrong matrix for the custom layer (nothing drawn) | Use `defaultProjectionData.mainMatrix` in this MapLibre version |

### Known limits
- Buildings cannot be shown below zoom 13 with this map data.
- Trains are not clickable yet (Week 4).

### Bugs reported on the 3D trains (fixed)
| Bug | Cause | Fix |
|---|---|---|
| Colours washed out or wrong | Lights too strong (ambient 1.1 + sun 1.6) and an extra 12% white tint | Ambient 1.0 + sun 0.9, no tint, so the roof shows the true line colour |
| Train box cut through buildings | Tracks run in tunnels under the buildings, and the box shared the buildings' depth buffer | Clear depth before drawing trains, so they always show on top |
| Centre of the map was a solid blob of bars | Trains drawn about 22 px long when zoomed out | 14 px long, 4.5 px wide |

## 2026-10-12 — Day 3, later: accurate tracks and a better train model

### Studied Mini Tokyo 3D (MIT licence)
Cloned to a scratch folder outside the repo, read only, not run or copied.
- It does not draw tracks from the live feed. It ships pre-built per-railway geometry (`data/coordinates.json`, about 2.5 MB: per railway, sublines with start/end station and a polyline).
- Trains are placed by slicing along that polyline (`src/turf/line-slice-along.js`), then drawn in a Three.js layer (`src/layers/three-layer.js`).
- Takeaway for us: build the track geometry once, offline, and ship it as data. We did exactly that.

### Accurate tracks
- TfL only gives straight lines between stations. Real track shape comes from OpenStreetMap.
- `backend/scripts/fetch-osm.mjs` downloads every subway, rail and light-rail way in Greater London from the Overpass API (tried four servers; only the French mirror answered). 12,657 ways, 14 MB, git-ignored.
- `backend/scripts/build-tracks.ts` builds a graph from those ways and routes every station-to-station link with A*, keeping only routes no longer than 1.6x the straight distance plus 300 m.
- Result: 469 of 520 links snapped (median detour 1.02), 51 stay straight. `backend/data/tracks.json` (400 KB) is committed.
- The server applies it at startup (`applyTracks`), so both the drawn lines and the train positions follow the real curves.

### Better 3D model
- Each train is six carriages: rounded-roof body in the line colour, dark window band, dark skirt, white headlight at the front, red tail light at the back. Four instanced meshes.
- Sizes are a little chunkier than real (5.2 m x 6.2 m) so it reads as 3D when zoomed in.

### Known limits
- 51 links (about 10%) still straight: no OSM route within the detour limit.
- OSM routing does not know which line a track belongs to, so on shared corridors a link may use the neighbouring line's track. Same corridor, tiny difference.

## 2026-10-12 — Week 4: train panel, follow camera, departures board

### What we did
- **Click a train.** Trains are drawn by Three.js, so the map cannot hit-test them. The layer projects every train to the screen and picks the nearest one within 18 px (`pick`). The selected train is drawn 1.5x bigger and brighter.
- **Train panel** (`TrainPanel.tsx`): line, destination, next station, arrival time and minutes, platform, current location, Follow button.
- **Follow mode**: each animation frame the camera is moved to the train's drawn position; bearing eases toward its heading, zoom toward 16, pitch toward 62. Dragging the map stops it.
- **Station board** (`StationPanel.tsx`): click a station dot and get a platform-screen style board. Backend `GET /api/stations/:id/arrivals` proxies TfL `/StopPoint/{id}/Arrivals`, cached 15 s so many viewers cost one TfL call; ids are validated against `^[A-Za-z0-9]+$`. Board refreshes every 15 s.
- Station dots are de-duplicated (interchanges used to be several overlapping dots) and carry their id.
- Phone layout: key hidden under 640 px, panels become a bottom sheet.

### Checked in the browser
- Clicked a District line train: panel showed destination Barking, next station Blackfriars, platform and "Left Temple".
- Follow: camera tracked it east along the river; the panel moved on to Mansion House.
- Clicked a station: board listed Jubilee trains with platforms and minutes.

### Problems and fixes
| Problem | Cause | Fix |
|---|---|---|
| Board header hidden behind the line key on a short window | Both anchored to the left, the board is tall | Smaller board height, key capped at 40% of the height |
| Scrollbar clipped "min" | Scrollbar took the column width | Padding on the list |
| Frontend dev server was down after restarting the backend | Restarting by port killed it | Start it again; keep the two servers separate |

### Known limits
- Not tried on a real phone yet (Week 5 polish).
- A train that drops out of the feed closes its panel.
- The board shows TfL's own platform names and sometimes repeats a destination when several trains are due.

### Trains that bend with the track (Mini Tokyo 3D style)
**Problem:** each train was one rigid straight line, so on a curve it stuck out sideways like a stick.

**Fix:** like Mini Tokyo 3D, place every carriage on its own stretch of track.
- Server sends, per train, the stations it runs along (`ids`: before, from, to, after), the index of `from`, and metres along the from-to link now (`d0`) and one poll later (`d1`). New `GET /api/tracks` serves the real track shape of every link (400 KB, loaded once).
- Browser (`tracks.ts`) chains those link shapes into one run of track in metres, with a distance at each vertex. Past either end it extends the last segment straight, so carriages over a terminus keep a sensible heading.
- Each carriage looks up the track at its own start and end (`pointAt`), sits halfway between them and turns to the chord, so six carriages follow a curve as a chain. Lights go at the two ends, in the end carriages' directions.
- A train slides along the chain (`fromS` to `toS` over 30 s). On new data it continues from where it is drawn now, found by projecting that point onto the new chain.
- Proportions: 72 m x 6 m x 6.4 m (was 100 x 5.2 x 6.2), 16 px long when zoomed out, so it reads as a block not a stick.

**Checked:** all 689 trains get a chain (419 with four stations of track). Followed a Victoria line train round a corner in the browser.

### Known limits
- Where a station has two possible tracks behind it (a junction), the rear carriages may follow the wrong branch for a moment.
- Carriages are a rigid chord each; there is no articulation inside one carriage.
