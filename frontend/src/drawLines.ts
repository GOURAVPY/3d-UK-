import type maplibregl from "maplibre-gl";
import type { Line } from "./types";

// Draw each line's track in its real colour, with a dot for every station.
export function drawLines(map: maplibregl.Map, lines: Line[]) {
  map.addSource("lines", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: lines.flatMap((l) =>
        l.paths.map((p) => ({
          type: "Feature" as const,
          properties: { colour: l.colour },
          geometry: { type: "LineString" as const, coordinates: p },
        })),
      ),
    },
  });
  map.addLayer({
    id: "lines",
    type: "line",
    source: "lines",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "colour"], "line-width": 3 },
  });

  map.addSource("stations", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: lines.flatMap((l) =>
        l.stations.map((s) => ({
          type: "Feature" as const,
          properties: { name: s.name },
          geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
        })),
      ),
    },
  });
  map.addLayer({
    id: "stations",
    type: "circle",
    source: "stations",
    paint: {
      "circle-radius": 3,
      "circle-color": "#fff",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#333",
    },
  });
}
