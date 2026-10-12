import type { Map } from "maplibre-gl";

// Replace the flat building fill with extruded 3D buildings.
export function add3dBuildings(map: Map) {
  if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
  map.addLayer({
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 13,
    paint: {
      "fill-extrusion-color": "#d8d8d4",
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.85,
    },
  });
}
