import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Line } from "./types";
import { drawLines } from "./drawLines";

const LONDON: [number, number] = [-0.1276, 51.5072];

export function App() {
  const container = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current!,
      style: "https://tiles.openfreemap.org/styles/positron",
      center: LONDON,
      zoom: 10.5,
    });
    map.on("load", async () => {
      const data: Line[] = await (await fetch("/api/lines")).json();
      setLines(data);
      drawLines(map, data);
    });
    return () => map.remove();
  }, []);

  return (
    <>
      <div ref={container} className="map" />
      <div className="key">
        {lines.map((l) => (
          <div key={l.id}><i style={{ background: l.colour }} />{l.name}</div>
        ))}
      </div>
    </>
  );
}
