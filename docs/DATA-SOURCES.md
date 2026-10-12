# Data sources: what each API gives us

Counts measured on 2026-10-12 by calling each API once.

## Live data (called while the app runs)

| Source | Endpoint | What it gives | Size now | Fields | We use | How often |
|---|---|---|---|---|---|---|
| TfL | `/Line/{id}/Arrivals` | Arrival predictions: which train, next stop, seconds to arrive, platform, "Between X and Y" | ~500 running trains from ~1,700 vehicle entries, 19 requests | 19 per prediction | 9 | every 30 s (19 requests) |
| TfL | `/Line/Mode/.../Status` | Service status of every line, with TfL's reason text | 19 lines | 10 + 5 per status | 4 | every 2 min |
| TfL | `/StopPoint/{id}/Arrivals` | Departures board of one station | ~40 predictions at Waterloo | 20 per prediction | 7 | when you open a station, cached 15 s |
| TfL | `/StopPoint/{id}` | Station details: zone, address, phone, facilities, lines, modes | 34 properties, 8 child stops (Waterloo) | 16 top-level | 8 | when you open a station, cached 1 h |
| adsb.lol | `/v2/point/51.5/-0.1/70` | Live aircraft within 70 nm of London | ~165 aircraft (about 115 airborne) | 50 on a full record | 11 | every 10 s |
| OpenFreeMap | style + vector tiles | Base map (streets, water, buildings), day and dark styles | 47 style layers, 2 tile sources | n/a | all | as you pan and zoom |

TfL request rate: 19 requests per 30 s for trains (about 38 per minute) plus status, against TfL's limit of 500 per minute.

## Built once, offline (scripts in `backend/scripts`)

| Source | What it gave | Size | Turned into |
|---|---|---|---|
| TfL `/Line/{id}/Route/Sequence` | Station order and coordinates of every line | 19 lines, 470 stations | `links` (neighbouring stations) |
| OpenStreetMap, rail ways (Overpass) | Real track geometry with tags (`tunnel`, `bridge`, `layer`, `railway`) | 12,657 ways, 97,990 points, 139 distinct tag names | `tracks.json` (580 links, 18,554 points) and `levels.json` (456 links with an underground or elevated stretch) |
| OpenStreetMap, line route relations (Overpass) | Which ways belong to which line | 133 relations, 13,148 members | per-line track routing |
| Computed | Which lines share a corridor | 190 links with a lane offset | `lanes.json` |
| Mini Tokyo 3D (MIT licence) | Read as a reference only; nothing copied | n/a | the lane and level design |

## What we derive ourselves
- Train position between stations (the API only gives arrival times, never GPS).
- Heading, distance along track, the queue of trains waiting at a station.
- Underground / surface / elevated state of each stretch.
- A 24 hour history of every poll (`backend/data/history.jsonl`) for the replay.

## What the app shows you
Trains (~700), stations (470), lines (19), aircraft (~165), service status per line, a live board per station, a timeline of upcoming stops per train, and station facts (zone, lines, other modes, facilities, address).

## Filters we apply to the live feeds
- **Trains:** a vehicle is shown only if its next stop is under 15 minutes away and its following stop is under 20 minutes after that; otherwise it is a timetable entry, not a train. This removed about a third of the raw vehicles (almost all on the Elizabeth and Overground lines).
- **Aircraft:** ground vehicles (category C) are removed, and reports up to a minute old are moved forward to where the aircraft is now.
