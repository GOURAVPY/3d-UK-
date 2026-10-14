import type { Map } from "maplibre-gl";
import { isSmallScreen } from "./device";

// Replace the flat building fill with extruded 3D buildings. Taller buildings are shaded
// differently so the skyline reads in 3D: pale grey by day, deep blue-grey at night.
export function add3dBuildings(map: Map, night: boolean) {
  if (map.getLayer("building")) map.setLayoutProperty("building", "visibility", "none");
  map.addLayer({
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    // phones draw buildings only when close in, which is far fewer polygons
    minzoom: isSmallScreen ? 14.5 : 13,
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "render_height"], 8],
        0,
        night ? "#1b1e2b" : "#e4e4df",
        40,
        night ? "#272c40" : "#c4c4c0",
        150,
        night ? "#3a4263" : "#9a9a98",
      ],
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      // building data only exists from zoom 13, so fade in rather than pop
      "fill-extrusion-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        isSmallScreen ? 14.5 : 13,
        0,
        isSmallScreen ? 15.3 : 13.8,
        night ? 0.92 : 0.85,
      ],
    },
  });
}
