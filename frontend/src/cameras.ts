import type { GeoJSONSource, Map } from "maplibre-gl";
import type { Camera } from "./types";

// TfL JamCams as orange dots. Clicking one calls onSelect with the camera.
export function addCameraLayer(map: Map, cameras: Camera[], onSelect: (c: Camera) => void) {
  const byId = new globalThis.Map(cameras.map((c) => [c.id, c]));
  map.addSource("cameras", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: cameras
        .filter((c) => c.available)
        .map((c) => ({
          type: "Feature" as const,
          properties: { id: c.id },
          geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
        })),
    },
  });
  map.addLayer({
    id: "cameras",
    type: "circle",
    source: "cameras",
    minzoom: 10,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 7],
      "circle-color": "#ff6a00",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.on("click", "cameras", (e) => {
    const id = e.features?.[0]?.properties?.id as string | undefined;
    const cam = id ? byId.get(id) : undefined;
    if (cam) onSelect(cam);
  });
  map.on("mouseenter", "cameras", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "cameras", () => (map.getCanvas().style.cursor = ""));
}

export function setCamerasVisible(map: Map, visible: boolean) {
  if (map.getLayer("cameras")) map.setLayoutProperty("cameras", "visibility", visible ? "visible" : "none");
}

// Kept for symmetry with trains: replace the camera data later if it is refreshed.
export function setCameraData(map: Map, cameras: Camera[]) {
  (map.getSource("cameras") as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: cameras.filter((c) => c.available).map((c) => ({
      type: "Feature" as const,
      properties: { id: c.id },
      geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] },
    })),
  });
}
