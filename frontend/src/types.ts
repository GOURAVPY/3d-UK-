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
  heading: number; // compass degrees, 0 = north
  // Stations the train runs along [before?, from, to, after?], the index of `from`, and
  // metres from `from` towards `to` now (d0) and one poll later (d1).
  ids: string[];
  fromIndex: number;
  d0: number;
  d1: number;
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

export interface Departure {
  lineId: string;
  lineName: string;
  colour: string;
  destination: string;
  platform: string;
  seconds: number;
  currentLocation: string;
}
