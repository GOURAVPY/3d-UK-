import type { Map } from "maplibre-gl";

// Underground Mode, after Mini Tokyo 3D: the surface fades back and what is below comes
// forward. Station buildings, platforms, passages and entrances are drawn in violet, the
// tunnels become solid lanes, and trains underground are no longer ghosts.
//
// The layers are always present (so a style change can re-add them in one place) but hidden
// until the mode is switched on.

const VIOLET = "#9b7bff";
const LAYERS = ["layout-station", "layout-platform", "layout-platform-line", "layout-passage", "layout-entrance"];

interface Layout {
  type: "FeatureCollection";
  features: unknown[];
}

export function addUndergroundLayers(map: Map, layout: Layout, night: boolean) {
  const colour = night ? VIOLET : "#6b4bd6";
  map.addSource("layout", { type: "geojson", data: layout as never });
  const base = { source: "layout", minzoom: 13.5, layout: { visibility: "none" as const } };

  // buildings and areas under the stations
  // everything goes under the lines so the lanes stay on top of the layout
  const under = map.getLayer("lines-glow") ? "lines-glow" : undefined;
  map.addLayer({
    ...base,
    id: "layout-station",
    type: "fill",
    filter: ["all", ["==", ["get", "k"], "station"], ["==", ["geometry-type"], "Polygon"]],
    paint: { "fill-color": colour, "fill-opacity": 0.28, "fill-outline-color": colour },
  }, under);
  // platforms
  map.addLayer({
    ...base,
    id: "layout-platform",
    type: "fill",
    filter: ["all", ["==", ["get", "k"], "platform"], ["==", ["geometry-type"], "Polygon"]],
    paint: { "fill-color": night ? "#d3c4ff" : "#8f74ee", "fill-opacity": 0.6 },
  }, under);
  map.addLayer({
    ...base,
    id: "layout-platform-line",
    type: "line",
    filter: ["all", ["==", ["get", "k"], "platform"], ["==", ["geometry-type"], "LineString"]],
    paint: {
      "line-color": night ? "#d3c4ff" : "#8f74ee",
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 2, 18, 8],
      "line-opacity": 0.8,
    },
  }, under);
  // passages, stairs and corridors between the platforms and the street
  map.addLayer({
    ...base,
    id: "layout-passage",
    type: "line",
    filter: ["==", ["get", "k"], "passage"],
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": colour,
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.2, 18, 5],
      "line-opacity": 0.85,
    },
  }, under);
  // ways in from the street
  map.addLayer({
    ...base,
    id: "layout-entrance",
    type: "circle",
    filter: ["==", ["get", "k"], "entrance"],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.5, 18, 6],
      "circle-color": "#ffffff",
      "circle-stroke-color": colour,
      "circle-stroke-width": 2,
    },
  }, under);
}

// Switch the mode on or off. `night` only picks how far the surface is dimmed.
export function setUndergroundMode(map: Map, on: boolean, night: boolean) {
  for (const id of LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
  const set = (layer: string, prop: string, value: unknown) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop as never, value as never);
  };

  // the city above fades back
  set("buildings-3d", "fill-extrusion-opacity", on ? 0.1 : [
    "interpolate", ["linear"], ["zoom"], 13, 0, 13.8, night ? 0.92 : 0.85,
  ]);
  set("lines", "line-opacity", on ? 0.5 : 1);
  set("lines-glow", "line-opacity", on ? 0.18 : night ? 0.6 : 0.28);

  // tunnels come forward: solid, bright, a little thicker
  set("lines-tunnel", "line-dasharray", on ? [1, 0] : [1.4, 1.6]);
  set("lines-tunnel", "line-opacity", on ? 1 : night ? 0.55 : 0.5);
  set("lines-tunnel", "line-width", on
    ? ["interpolate", ["linear"], ["zoom"], 9, 3, 13, 5, 17, 8]
    : ["interpolate", ["linear"], ["zoom"], 9, 1.5, 13, 2.5, 17, 4]);

  // stations a little larger so they read as the layout's anchors
  set("stations", "circle-radius", on
    ? ["interpolate", ["linear"], ["zoom"], 9, 3.5, 15, 7]
    : ["interpolate", ["linear"], ["zoom"], 9, 2.5, 15, 5]);
}
