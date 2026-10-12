import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Camera, Line } from "./types";
import { add3dBuildings } from "./buildings";
import { addCameraLayer, setCamerasVisible } from "./cameras";
import { CameraPanel } from "./CameraPanel";
import { drawLines } from "./drawLines";
import { Tools } from "./Tools";
import { addTrainLayer, createTrainAnimator } from "./trains";
import { useTrains } from "./useTrains";

const LONDON: [number, number] = [-0.1276, 51.5072];

export function App() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const animator = useRef<ReturnType<typeof createTrainAnimator> | null>(null);
  const [ready, setReady] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [showCameras, setShowCameras] = useState(true);
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
    // style.load fires as soon as the style is ready, long before every tile has arrived
    map.once("style.load", async () => {
      const [data, cams]: [Line[], Camera[]] = await Promise.all([
        fetch("/api/lines").then((r) => r.json()),
        fetch("/api/cameras").then((r) => r.json()),
      ]);
      setLines(data);
      add3dBuildings(map);
      drawLines(map, data);
      addCameraLayer(map, cams, setCamera);
      addTrainLayer(map);
      animator.current = createTrainAnimator(map);
      setReady(true);
    });
    return () => {
      animator.current?.stop();
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (ready && mapRef.current) setCamerasVisible(mapRef.current, showCameras);
  }, [ready, showCameras]);

  useEffect(() => {
    if (ready) animator.current?.update(trains);
  }, [ready, trains]);

  return (
    <>
      <div ref={container} className="map" />
      <div className="counter">
        <b>{trains.length}</b> trains running now
        {updatedAt && <small>updated {updatedAt.toLocaleTimeString("en-GB")}</small>}
      </div>
      <Tools
        showCameras={showCameras}
        onToggleCameras={() => setShowCameras((v) => !v)}
        onFlyTo={(lon, lat) => mapRef.current?.flyTo({ center: [lon, lat], zoom: 13.5, pitch: 55 })}
      />
      {camera && <CameraPanel camera={camera} onClose={() => setCamera(null)} />}
      <div className="key">
        {lines.map((l) => (
          <div key={l.id}><i style={{ background: l.colour }} />{l.name}</div>
        ))}
      </div>
    </>
  );
}
