import { tfl } from "./tfl.js";

export interface Camera {
  id: string;
  name: string;
  lat: number;
  lon: number;
  imageUrl: string;
  videoUrl: string;
  available: boolean;
}

interface Place {
  id: string;
  commonName: string;
  lat: number;
  lon: number;
  additionalProperties: { key: string; value: string }[];
}

// TfL JamCams: road traffic cameras with a still image and a short clip each.
export async function loadCameras(): Promise<Camera[]> {
  const places = await tfl<Place[]>("/Place/Type/JamCam");
  return places.map((p) => {
    const prop = (k: string) => p.additionalProperties.find((a) => a.key === k)?.value ?? "";
    return {
      id: p.id,
      name: p.commonName,
      lat: p.lat,
      lon: p.lon,
      imageUrl: prop("imageUrl"),
      videoUrl: prop("videoUrl"),
      available: prop("available") === "true",
    };
  });
}
