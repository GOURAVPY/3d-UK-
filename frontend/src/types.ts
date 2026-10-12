export interface Station { id: string; name: string; lat: number; lon: number }
export interface Line {
  id: string;
  name: string;
  mode: string;
  colour: string;
  paths: [number, number][][];
  stations: Station[];
  links: [string, string][]; // neighbouring stations
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

export interface Flight {
  id: string;
  callsign: string;
  type: string;
  reg: string;
  lat: number;
  lon: number;
  altM: number;
  onGround: boolean;
  speedMs: number;
  track: number;
  climbMs: number;
  roll: number;
  category: string;
}

export interface LineStatus {
  lineId: string;
  lineName: string;
  severity: number; // 10 good service, 9 minor delays, 6 severe delays, lower is worse
  text: string;
  reason: string;
}
