import type { GeoJSONSource, Map } from "maplibre-gl";
import type { Train } from "./types";

// Each update says where a train is now and where it will be one poll later.
// The browser glides every train from its current spot to that target.
const GLIDE_MS = 30_000;

interface Glide {
  colour: string;
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  start: number;
}

export function addTrainLayer(map: Map) {
  map.addSource("trains", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "trains",
    type: "circle",
    source: "trains",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 7],
      "circle-color": ["get", "colour"],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });
}

export function createTrainAnimator(map: Map) {
  const glides = new globalThis.Map<string, Glide>();
  let frame = 0;

  const position = (g: Glide, now: number): [number, number] => {
    const f = Math.min(Math.max((now - g.start) / GLIDE_MS, 0), 1);
    return [g.fromLon + (g.toLon - g.fromLon) * f, g.fromLat + (g.toLat - g.fromLat) * f];
  };

  const draw = () => {
    const now = performance.now();
    const features = [...glides.entries()].map(([id, g]) => ({
      type: "Feature" as const,
      properties: { id, colour: g.colour },
      geometry: { type: "Point" as const, coordinates: position(g, now) },
    }));
    (map.getSource("trains") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
    frame = requestAnimationFrame(draw);
  };

  return {
    // New data: start each glide from where the train is drawn right now, so nothing jumps.
    update(trains: Train[]) {
      const now = performance.now();
      const next = new globalThis.Map<string, Glide>();
      for (const t of trains) {
        const old = glides.get(t.id);
        const [fromLon, fromLat] = old ? position(old, now) : [t.lon, t.lat];
        next.set(t.id, { colour: t.colour, fromLon, fromLat, toLon: t.toLon, toLat: t.toLat, start: now });
      }
      glides.clear();
      next.forEach((g, id) => glides.set(id, g));
      if (!frame) frame = requestAnimationFrame(draw);
    },
    stop() {
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
