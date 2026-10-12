export interface Station { id: string; name: string; lat: number; lon: number }
export interface Line {
  id: string;
  name: string;
  mode: string;
  colour: string;
  paths: [number, number][][];
  stations: Station[];
}

export interface Train {
  id: string;
  lineId: string;
  lineName: string;
  colour: string;
  nextStationId: string;
  nextStation: string;
  destination: string;
  platform: string;
  currentLocation: string;
  secondsToNext: number;
  expectedArrival: string;
  lat: number; // estimated position when the update arrived
  lon: number;
  toLat: number; // where it will be one poll later
  toLon: number;
}

export interface Camera {
  id: string;
  name: string;
  lat: number;
  lon: number;
  imageUrl: string;
  videoUrl: string;
  available: boolean;
}

// A public live stream. `youtubeId` embeds it; without one we only link out.
export interface Stream {
  id: string;
  name: string;
  kind: "airport" | "rail";
  url: string;
  youtubeId?: string;
  lat?: number;
  lon?: number;
}
