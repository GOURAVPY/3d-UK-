import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Line } from "./types";
import { add3dBuildings } from "./buildings";
import { drawLines } from "./drawLines";
import { StationPanel } from "./StationPanel";
import { Tools } from "./Tools";
import { TrainPanel } from "./TrainPanel";
import { createTrainsLayer } from "./trains";
import { useTrains } from "./useTrains";

const LONDON: [number, number] = [-0.1276, 51.5072];
const FOLLOW_ZOOM = 16;

export function App() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const trains3d = useRef<ReturnType<typeof createTrainsLayer> | null>(null);
  const [ready, setReady] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [station, setStation] = useState<{ id: string; name: string } | null>(null);
  const [following, setFollowing] = useState(false);
  const { trains, updatedAt } = useTrains();

  const selected = trains.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: LONDON,
      zoom: 13.2,
      minZoom: 9.5,
      pitch: 55,
      bearing: -15,
    });
    mapRef.current = map;
    // style.load fires as soon as the style is ready, long before every tile has arrived
    map.once("style.load", async () => {
      const data: Line[] = await (await fetch("/api/lines")).json();
      setLines(data);
      add3dBuildings(map);
      drawLines(map, data);
      trains3d.current = createTrainsLayer();
      map.addLayer(trains3d.current.layer);

      // a train wins over a station when both are under the pointer
      map.on("click", (e) => {
        const train = trains3d.current?.pick(e.point.x, e.point.y);
        if (train) {
          setStation(null);
          setSelectedId(train);
          return;
        }
        const pad = 9;
        const hit = map.queryRenderedFeatures(
          [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
          { layers: ["stations"] },
        )[0];
        if (hit) {
          setSelectedId(null);
          setFollowing(false);
          setStation({ id: String(hit.properties.id), name: String(hit.properties.name) });
        }
      });
      map.on("mousemove", (e) => {
        const over = trains3d.current?.pick(e.point.x, e.point.y);
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
    trains3d.current?.select(selectedId);
  }, [ready, selectedId]);

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
    if (!ready || !following || !selectedId || !map) return;
    let raf = 0;
    const stop = () => setFollowing(false);
    map.on("dragstart", stop);
    const tick = () => {
      const p = trains3d.current?.positionOf(selectedId);
      if (p) {
        const delta = ((p.heading - map.getBearing() + 540) % 360) - 180; // shortest turn
        map.jumpTo({
          center: [p.lon, p.lat],
          bearing: map.getBearing() + delta * 0.04,
          zoom: map.getZoom() + (FOLLOW_ZOOM - map.getZoom()) * 0.06,
          pitch: map.getPitch() + (62 - map.getPitch()) * 0.06,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      map.off("dragstart", stop);
    };
  }, [ready, following, selectedId]);

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
      {station && !selected && (
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
