import type { GeoJSONSource, Map } from "maplibre-gl";
import type { Train } from "./types";

// Trains are plain dots at their next station for now (Week 3 adds real positions).
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

export function updateTrains(map: Map, trains: Train[]) {
  const src = map.getSource("trains") as GeoJSONSource | undefined;
  src?.setData({
    type: "FeatureCollection",
    features: trains.map((t) => ({
      type: "Feature" as const,
      properties: { id: t.id, colour: t.colour },
      geometry: { type: "Point" as const, coordinates: [t.lon, t.lat] },
    })),
  });
}
