import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Line, Train } from "./types";
import { add3dBuildings } from "./buildings";
import { AlertsBar } from "./AlertsBar";
import { drawLines, setAlerts } from "./drawLines";
import { createFlightsLayer } from "./flights";
import { FlightPanel } from "./FlightPanel";
import { ReplayBar } from "./ReplayBar";
import { StationPanel } from "./StationPanel";
import { Tools } from "./Tools";
import { TrainPanel } from "./TrainPanel";
import { MAX_PIXEL_RATIO } from "./device";
import { STYLE_DAY, STYLE_NIGHT, isNight, londonClock, type ThemeMode } from "./daynight";
import { TrackIndex } from "./tracks";
import { addUndergroundLayers, setUndergroundMode } from "./underground";
import { createTrainsLayer } from "./trains";
import { useFlights } from "./useFlights";
import { useStatus } from "./useStatus";
import { useTrains } from "./useTrains";

const LONDON: [number, number] = [-0.1276, 51.5072];
const FOLLOW_ZOOM = 16;

// Optional ?view=lon,lat,zoom to open the map somewhere specific.
function startView(): { center: [number, number]; zoom: number } {
  const v = new URLSearchParams(location.search).get("view")?.split(",").map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite)) return { center: [v[0], v[1]], zoom: v[2] };
  return { center: LONDON, zoom: 13.2 };
}

export function App() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const trains3d = useRef<ReturnType<typeof createTrainsLayer> | null>(null);
  const [ready, setReady] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const flights3d = useRef<ReturnType<typeof createFlightsLayer> | null>(null);
  const world = useRef<{ lines: Line[]; index: TrackIndex; layout: { type: "FeatureCollection"; features: unknown[] } } | null>(null);
  const [underground, setUnderground] = useState(() => new URLSearchParams(location.search).has("underground"));
  const undergroundRef = useRef(false);
  undergroundRef.current = underground;
  const stopLines = useRef<(() => void) | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  // remember the theme choice (private windows may block storage, so every access is guarded)
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem("theme");
      return saved === "day" || saved === "night" ? saved : "auto";
    } catch {
      return "auto";
    }
  });
  const [now, setNow] = useState(() => new Date());
  const night = mode === "auto" ? isNight(now) : mode === "night";
  const nightRef = useRef(night);
  nightRef.current = night;
  const shownStyle = useRef(night ? STYLE_NIGHT : STYLE_DAY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [station, setStation] = useState<{ id: string; name: string } | null>(null);
  const [following, setFollowing] = useState(false);
  const [replay, setReplay] = useState(false);
  const [eco, setEco] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { trains, updatedAt } = useTrains();
  const flights = useFlights();
  const status = useStatus();

  const selected = trains.find((t) => t.id === selectedId) ?? null;
  const selectedFlight = flights.find((f) => f.id === selectedFlightId) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem("theme", mode);
    } catch {
      /* storage unavailable: the choice just will not persist */
    }
  }, [mode]);

  // The clock ticks so the map can go dark at real sunset.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: shownStyle.current,
      ...startView(),
      pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
      minZoom: 9.5,
      pitch: 55,
      bearing: -15,
    });
    mapRef.current = map;

    // A new map style wipes our layers, so every style.load puts them back. style.load fires
    // as soon as the style is ready, long before every tile has arrived.
    map.on("style.load", async () => {
      if (!world.current) {
        const [data, shapes, lanes, levels, layout]: [
          Line[],
          Record<string, [number, number][]>,
          Record<string, number>,
          Record<string, [number, number][]>,
          { type: "FeatureCollection"; features: unknown[] },
        ] = await Promise.all([
          fetch("/api/lines").then((r) => r.json()),
          fetch("/api/tracks").then((r) => r.json()),
          fetch("/api/lanes").then((r) => r.json()),
          fetch("/api/levels").then((r) => r.json()),
          fetch("/api/layout").then((r) => r.json()),
        ]);
        const stations = new globalThis.Map<string, [number, number]>();
        for (const l of data) for (const s of l.stations) stations.set(s.id, [s.lon, s.lat]);
        world.current = { lines: data, index: new TrackIndex(stations, shapes, lanes, levels), layout };
        setLines(data);
      }
      const { lines: data, index, layout } = world.current;
      const dark = nightRef.current;
      stopLines.current?.();
      add3dBuildings(map, dark);
      stopLines.current = drawLines(map, data, index, dark);
      addUndergroundLayers(map, layout, dark);
      setUndergroundMode(map, undergroundRef.current, dark);
      trains3d.current = createTrainsLayer(index);
      trains3d.current.setNight(dark);
      trains3d.current.setUnderground(undergroundRef.current);
      map.addLayer(trains3d.current.layer);
      flights3d.current = createFlightsLayer();
      flights3d.current.setNight(dark);
      map.addLayer(flights3d.current.layer);
      setStyleVersion((v) => v + 1);
      setReady(true);
    });

    // a train wins over a station when both are under the pointer
    map.on("click", (e) => {
      const train = trains3d.current?.pick(e.point.x, e.point.y);
      if (train) {
        setStation(null);
        setSelectedFlightId(null);
        setSelectedId(train);
        const lv = trains3d.current?.levelOf(train);
        if (lv !== null && lv !== undefined) setUnderground(lv < -0.5);
        return;
      }
      const plane = flights3d.current?.pick(e.point.x, e.point.y);
      if (plane) {
        setStation(null);
        setSelectedId(null);
        setFollowing(false);
        setSelectedFlightId(plane);
        return;
      }
      if (!map.getLayer("stations")) return;
      const pad = 9;
      const hit = map.queryRenderedFeatures(
        [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
        { layers: ["stations"] },
      )[0];
      if (hit) {
        setSelectedId(null);
        setSelectedFlightId(null);
        setFollowing(false);
        setStation({ id: String(hit.properties.id), name: String(hit.properties.name) });
      }
    });
    map.on("mousemove", (e) => {
      const over = trains3d.current?.pick(e.point.x, e.point.y) ?? flights3d.current?.pick(e.point.x, e.point.y);
      const near = map.getLayer("stations")
        ? map.queryRenderedFeatures(
            [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]],
            { layers: ["stations"] },
          ).length
        : 0;
      map.getCanvas().style.cursor = over || near ? "pointer" : "";
    });
    return () => {
      map.remove();
    };
  }, []);

  // Day <-> night: swap the base map; style.load above rebuilds our layers in the new look.
  useEffect(() => {
    const map = mapRef.current;
    const wanted = night ? STYLE_NIGHT : STYLE_DAY;
    if (!map || wanted === shownStyle.current) return;
    shownStyle.current = wanted;
    map.setStyle(wanted, { diff: false });
  }, [night]);

  useEffect(() => {
    if (ready && mapRef.current) setAlerts(mapRef.current, status);
  }, [ready, status, styleVersion]);

  // Underground Mode: the city fades, the layout and tunnels come forward.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    setUndergroundMode(mapRef.current, underground, night);
    trains3d.current?.setUnderground(underground);
    flights3d.current?.setUnderground(underground);
  }, [ready, underground, night, styleVersion]);

  // While replaying, the recorded trains drive the map instead of the live feed.
  useEffect(() => {
    if (ready && !replay) {
      trains3d.current?.setGlideMs(30_000);
      trains3d.current?.update(trains);
    }
  }, [ready, trains, styleVersion, replay]);

  const showReplayFrame = useCallback((list: Train[], glideMs: number) => {
    trains3d.current?.setGlideMs(glideMs);
    trains3d.current?.update(list);
  }, []);

  const toggleReplay = () => {
    setReplay((r) => !r);
    setSelectedId(null);
    setSelectedFlightId(null);
    setStation(null);
    setFollowing(false);
  };

  // Playback shows recorded trains only; aircraft are not recorded.
  useEffect(() => {
    if (ready) flights3d.current?.update(replay ? [] : flights);
  }, [ready, flights, styleVersion, replay]);

  // Eco Mode
  useEffect(() => {
    if (!ready) return;
    trains3d.current?.setEco(eco);
    flights3d.current?.setEco(eco);
  }, [ready, eco, styleVersion]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    trains3d.current?.select(selectedId);
  }, [ready, selectedId, styleVersion]);

  useEffect(() => {
    flights3d.current?.select(selectedFlightId);
  }, [ready, selectedFlightId, styleVersion]);

  // ?train=victoria:213 opens that train's panel as soon as it shows up in the feed.
  const wantedTrain = useRef(new URLSearchParams(location.search).get("train"));
  useEffect(() => {
    const id = wantedTrain.current;
    if (ready && id && trains.some((t) => t.id === id)) {
      wantedTrain.current = null;
      setSelectedId(id);
    }
  }, [ready, trains]);

  // ?station=940GZZLUWLO opens that station's panel.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("station");
    if (ready && id && /^[A-Za-z0-9]+$/.test(id)) setStation({ id, name: "" });
  }, [ready]);

  // The train left the feed: drop the selection.
  useEffect(() => {
    if (ready && selectedId && !selected) {
      setSelectedId(null);
      setFollowing(false);
    }
  }, [ready, selectedId, selected]);

  // Follow mode: the camera rides along with the train until the user drags the map.
  useEffect(() => {
    const map = mapRef.current;
    const targetId = selectedId ?? selectedFlightId;
    if (!ready || !following || !targetId || !map) return;
    let raf = 0;
    const stop = () => setFollowing(false);
    map.on("dragstart", stop);
    // aircraft fly high: aim the camera at the plane itself, not the ground under it
    if (!selectedId) map.setCenterClampedToGround(false);
    const tick = () => {
      const p = selectedId
        ? trains3d.current?.positionOf(targetId)
        : flights3d.current?.positionOf(targetId);
      if (p) {
        if (selectedId) {
          const lv = trains3d.current?.levelOf(selectedId);
          // a little hysteresis so a train at the tunnel mouth does not flicker the mode
          if (lv !== null && lv !== undefined) {
            if (lv < -0.7 && !undergroundRef.current) setUnderground(true);
            else if (lv > -0.3 && undergroundRef.current) setUnderground(false);
          }
        }
        const alt = (p as { alt?: number }).alt;
        if (!selectedId && alt !== undefined) map.setCenterElevation(alt);
        const delta = ((p.heading - map.getBearing() + 540) % 360) - 180; // shortest turn
        map.jumpTo({
          center: [p.lon, p.lat],
          bearing: map.getBearing() + delta * 0.04,
          zoom: map.getZoom() + ((selectedId ? FOLLOW_ZOOM : 17) - map.getZoom()) * 0.06,
          pitch: map.getPitch() + (62 - map.getPitch()) * 0.06,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      map.off("dragstart", stop);
      if (!selectedId) {
        map.setCenterElevation(0);
        map.setCenterClampedToGround(true);
      }
    };
  }, [ready, following, selectedId, selectedFlightId]);

  const closeTrain = () => {
    setSelectedId(null);
    setFollowing(false);
  };

  return (
    <>
      <div ref={container} className="map" />
      <div className="counter">
        <b>{trains.length}</b> trains running now
        <small>London {londonClock(now)}{updatedAt && ` · updated ${updatedAt.toLocaleTimeString("en-GB")}`}</small>
      </div>
      <AlertsBar status={status} />
      <Tools
        mode={mode}
        night={night}
        eco={eco}
        onToggleEco={() => setEco((e) => !e)}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
        underground={underground}
        onToggleUnderground={() => setUnderground((u) => !u)}
        replay={replay}
        onToggleReplay={toggleReplay}
        onCycleMode={() => setMode((m) => (m === "auto" ? "day" : m === "day" ? "night" : "auto"))}
        onFlyTo={(lon, lat) => mapRef.current?.flyTo({ center: [lon, lat], zoom: 13.5, pitch: 55 })}
      />
      {selected && (
        <TrainPanel
          train={selected}
          following={following}
          onFollow={() => setFollowing((f) => !f)}
          onClose={closeTrain}
        />
      )}
      {selectedFlight && !selected && (
        <FlightPanel
          flight={selectedFlight}
          following={following}
          onFollow={() => setFollowing((v) => !v)}
          onClose={() => {
            setSelectedFlightId(null);
            setFollowing(false);
          }}
        />
      )}
      {station && !selected && !selectedFlight && (
        <StationPanel stationId={station.id} name={station.name} onClose={() => setStation(null)} />
      )}
      {replay && <ReplayBar lines={lines} onFrame={showReplayFrame} onClose={toggleReplay} />}
      <div className="key">
        {lines.map((l) => (
          <div key={l.id}><i style={{ background: l.colour }} />{l.name}</div>
        ))}
      </div>
    </>
  );
}
