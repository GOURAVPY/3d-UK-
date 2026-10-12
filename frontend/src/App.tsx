import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Line } from "./types";
import { add3dBuildings } from "./buildings";
import { drawLines } from "./drawLines";
import { addTrainLayer, updateTrains } from "./trains";
import { useTrains } from "./useTrains";

const LONDON: [number, number] = [-0.1276, 51.5072];

export function App() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const { trains, updatedAt } = useTrains();

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: LONDON,
      zoom: 12.5,
      pitch: 55,
      bearing: -15,
    });
    mapRef.current = map;
    map.on("load", async () => {
      const data: Line[] = await (await fetch("/api/lines")).json();
      setLines(data);
      add3dBuildings(map);
      drawLines(map, data);
      addTrainLayer(map);
      setReady(true);
    });
    return () => map.remove();
  }, []);

  useEffect(() => {
    if (ready && mapRef.current) updateTrains(mapRef.current, trains);
  }, [ready, trains]);

  return (
    <>
      <div ref={container} className="map" />
      <div className="counter">
        <b>{trains.length}</b> trains running now
        {updatedAt && <small>updated {updatedAt.toLocaleTimeString("en-GB")}</small>}
      </div>
      <div className="key">
        {lines.map((l) => (
          <div key={l.id}><i style={{ background: l.colour }} />{l.name}</div>
        ))}
      </div>
    </>
  );
}
