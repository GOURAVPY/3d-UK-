import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Line } from "./types";
import { add3dBuildings } from "./buildings";
import { drawLines } from "./drawLines";
import { createFlightsLayer } from "./flights";
import { FlightPanel } from "./FlightPanel";
import { StationPanel } from "./StationPanel";
import { Tools } from "./Tools";
import { TrainPanel } from "./TrainPanel";
import { TrackIndex } from "./tracks";
import { createTrainsLayer } from "./trains";
import { useFlights } from "./useFlights";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [station, setStation] = useState<{ id: string; name: string } | null>(null);
  const [following, setFollowing] = useState(false);
  const { trains, updatedAt } = useTrains();
  const flights = useFlights();

  const selected = trains.find((t) => t.id === selectedId) ?? null;
  const selectedFlight = flights.find((f) => f.id === selectedFlightId) ?? null;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: "https://tiles.openfreemap.org/styles/positron",
      ...startView(),
      minZoom: 9.5,
      pitch: 55,
      bearing: -15,
    });
    mapRef.current = map;
    // style.load fires as soon as the style is ready, long before every tile has arrived
    map.once("style.load", async () => {
      const [data, shapes]: [Line[], Record<string, [number, number][]>] = await Promise.all([
        fetch("/api/lines").then((r) => r.json()),
        fetch("/api/tracks").then((r) => r.json()),
      ]);
      setLines(data);
      const stations = new globalThis.Map<string, [number, number]>();
      for (const l of data) for (const s of l.stations) stations.set(s.id, [s.lon, s.lat]);
      add3dBuildings(map);
      drawLines(map, data);
      trains3d.current = createTrainsLayer(new TrackIndex(stations, shapes));
      map.addLayer(trains3d.current.layer);
      flights3d.current = createFlightsLayer();
      map.addLayer(flights3d.current.layer);

      // a train wins over a station when both are under the pointer
      map.on("click", (e) => {
        const train = trains3d.current?.pick(e.point.x, e.point.y);
        if (train) {
          setStation(null);
          setSelectedFlightId(null);
          setSelectedId(train);
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
        const near = map.queryRenderedFeatures(
          [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]],
          { layers: ["stations"] },
        ).length;
        map.getCanvas().style.cursor = over || near ? "pointer" : "";
      });
      setReady(true);
    });
    return () => {
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (ready) trains3d.current?.update(trains);
  }, [ready, trains]);

  useEffect(() => {
    if (ready) flights3d.current?.update(flights);
  }, [ready, flights]);

  useEffect(() => {
    trains3d.current?.select(selectedId);
  }, [ready, selectedId]);

  useEffect(() => {
    flights3d.current?.select(selectedFlightId);
  }, [ready, selectedFlightId]);

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
        {updatedAt && <small>updated {updatedAt.toLocaleTimeString("en-GB")}</small>}
      </div>
      <Tools
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
      <div className="key">
        {lines.map((l) => (
          <div key={l.id}><i style={{ background: l.colour }} />{l.name}</div>
        ))}
      </div>
    </>
  );
}
