# How it works: turning arrival times into moving trains

▶ [Watch the 1-minute demo](demo/demo.mp4)

London's trains don't publish where they are. Transport for London (TfL) publishes something
else: for every station, which trains are coming and how many seconds away they are. This
project works backwards from those countdowns to a position on the real track, then animates
the trains in 3D between updates.

## 1. What TfL actually gives us

One call per line, `/Line/{id}/Arrivals`, returns every prediction on that line. A single row looks like:

| field | example |
|---|---|
| vehicleId | `241` |
| naptanId | `940GZZLUWRR` (Warren Street) |
| timeToStation | `95` seconds |
| platformName | `Southbound - Platform 2` |
| destinationName | `Battersea Power Station` |

At rush hour that is about 1,700 rows across 19 lines. They describe roughly 500 running trains,
because each train shows up once for every station still ahead of it.

## 2. From many predictions to one train

Group the rows by `vehicleId` and sort each group by `timeToStation`.

- **The first row is the next stop.** Train 241 reaches Warren Street in 95 s.
- **The second row gives the direction.** Its next-but-one stop is Goodge Street, so it is heading south.
- **The station behind it** is the neighbour of Warren Street on the line that is *not* Goodge Street: Euston.

So train 241 is somewhere on the Euston → Warren Street link, 95 seconds out.

## 3. From seconds to metres

How far is 95 seconds? We multiply by a typical speed for the mode
(Tube 11 m/s, Elizabeth line 17, Overground 14) and cap it at the length of the link:

```
distance before Warren Street = min(95 s × 11 m/s, link length)
                              = min(1,045 m, 820 m) = 820 m   → just leaving Euston
```

The link is not a straight line. Each station pair has its real track shape, built offline from
OpenStreetMap railway ways, so "820 m back along the track" lands on the curve the train
really runs on, at the right depth: tunnel, ground level or viaduct.

## 4. From a point every 30 s to smooth motion

The backend repeats this every 30 seconds and also computes where the train *will* be at the
next poll (`timeToStation − 30`). It pushes both distances over a WebSocket. The browser:

1. joins the track pieces before, under and after the train into one path,
2. slides the train from the first distance to the second over 30 seconds,
3. places each of the six carriages separately on that path, so trains bend round curves,
4. offsets trains sideways into lanes where several lines share a corridor.

## 5. Throwing out the ghosts

Not every vehicle in the feed is a moving train.

- **Timetable placeholders.** Elizabeth line and Overground list trips that haven't started.
  We drop any vehicle whose next stop is more than 15 minutes away, or whose next two stops are
  more than 20 minutes apart.
- **Trains waiting to depart.** A terminus can show several queued trips. Only the soonest one is drawn.
- **Missing IDs.** DLR predictions have no `vehicleId`, so DLR trains can't be tracked this way.
- **Outages.** If one line's request fails, its last known trains are kept rather than vanishing.

## 6. What it gets right and wrong

The estimate is good to a few hundred metres and usually sits on the correct side of the
correct station. It is worst when a train is held at a signal: the countdown freezes, so our
train slows to a stop just as the real one does, but it may sit a little early or late on the link.
A train's position is a model, not a GPS fix.

## Built with

TfL Unified API · OpenStreetMap (via Overpass) · OpenFreeMap tiles · adsb.lol for aircraft ·
MapLibre GL · Three.js · React + Vite · Node, Express and Socket.IO.

The deeper technical notes live in [LOGIC.md](LOGIC.md); the day-by-day build log is in [JOURNAL.md](JOURNAL.md).
