import type { GeoJSONSource, Map } from "maplibre-gl";
import type { Line } from "./types";
import { liftDark } from "./daynight";
import { laneSpacingMetres, type TrackIndex } from "./tracks";

// Each line is a coloured lane with a soft glow, like Mini Tokyo 3D. Lines that share a
// corridor run side by side. The lanes are redrawn as you zoom so the gap between them
// stays the same on screen.
// Returns a function that stops the zoom listener (when the map style is swapped).
export function drawLines(map: Map, lines: Line[], index: TrackIndex, night: boolean): () => void {
  const empty = { type: "FeatureCollection" as const, features: [] };
  map.addSource("lines", { type: "geojson", data: empty });

  map.addLayer({
    id: "lines-glow",
    type: "line",
    source: "lines",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "colour"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 8, 13, night ? 16 : 12, 17, night ? 28 : 20],
      "line-blur": night ? 8 : 6,
      "line-opacity": night ? 0.6 : 0.28,
    },
  });
  map.addLayer({
    id: "lines",
    type: "line",
    source: "lines",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "colour"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 13, 4, 17, 6],
    },
  });

  const shown = night ? lines.map((l) => ({ ...l, colour: liftDark(l.colour) })) : lines;
  let drawnAt = Number.NaN;
  const redraw = () => {
    // new lane spacing only when the zoom has moved a little, not on every frame
    const bucket = Math.round(map.getZoom() * 4) / 4;
    if (bucket === drawnAt) return;
    drawnAt = bucket;
    (map.getSource("lines") as GeoJSONSource).setData(index.lineFeatures(shown, laneSpacingMetres(bucket)));
  };
  redraw();
  map.on("zoom", redraw);

  map.addSource("stations", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      // interchanges appear on several lines: keep one dot per station
      features: [...new globalThis.Map(lines.flatMap((l) => l.stations).map((s) => [s.id, s] as const)).values()].map((s) => ({
        type: "Feature" as const,
        properties: { id: s.id, name: s.name },
        geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
      })),
    },
  });
  map.addLayer({
    id: "stations",
    type: "circle",
    source: "stations",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 15, 5],
      "circle-color": night ? "#0c0e14" : "#fff",
      "circle-stroke-width": 1.4,
      "circle-stroke-color": night ? "#ffffff" : "#333",
    },
  });

  return () => void map.off("zoom", redraw);
}
