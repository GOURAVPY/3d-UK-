// Live aircraft around London from adsb.lol (free, community ADS-B data, no key needed).
const CENTRE = { lat: 51.5, lon: -0.1 };
const RADIUS_NM = 70; // covers Heathrow, City, Luton, Stansted and the approaches to Gatwick

export interface Flight {
  id: string; // ICAO hex
  callsign: string;
  type: string; // ICAO type code, e.g. A320
  reg: string;
  lat: number;
  lon: number;
  altM: number; // metres above sea level, 0 on the ground
  onGround: boolean;
  speedMs: number; // ground speed, metres per second
  track: number; // compass degrees, 0 = north
  climbMs: number; // metres per second
  roll: number; // degrees, positive = right wing down
}

interface Raw {
  hex: string;
  flight?: string;
  t?: string;
  r?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  baro_rate?: number;
  roll?: number;
}

const FT = 0.3048;
const KT = 0.514444;

export async function fetchFlights(): Promise<Flight[]> {
  const url = `https://api.adsb.lol/v2/point/${CENTRE.lat}/${CENTRE.lon}/${RADIUS_NM}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "live-city-3d-student-project/0.1" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`adsb.lol HTTP ${res.status}`);
  const json = (await res.json()) as { ac?: Raw[] };
  const out: Flight[] = [];
  for (const a of json.ac ?? []) {
    if (typeof a.lat !== "number" || typeof a.lon !== "number") continue;
    const onGround = a.alt_baro === "ground";
    out.push({
      id: a.hex,
      callsign: (a.flight ?? "").trim(),
      type: a.t ?? "",
      reg: a.r ?? "",
      lat: a.lat,
      lon: a.lon,
      altM: onGround ? 0 : typeof a.alt_baro === "number" ? a.alt_baro * FT : 0,
      onGround,
      speedMs: (a.gs ?? 0) * KT,
      track: a.track ?? 0,
      climbMs: ((a.baro_rate ?? 0) * FT) / 60,
      roll: a.roll ?? 0,
    });
  }
  return out;
}
