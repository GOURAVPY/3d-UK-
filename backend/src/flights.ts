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
  category: string; // ADS-B emitter category: A3 airliner, A5 heavy, A7 helicopter ...
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
  category?: string;
  seen_pos?: number; // seconds since the position was last received
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
    // Category C is ground vehicles and fixed obstacles (airport service vehicles, fire trucks)
    if (a.category?.startsWith("C")) continue;
    const onGround = a.alt_baro === "ground";
    const speedMs = (a.gs ?? 0) * KT;
    const track = a.track ?? 0;
    const climbMs = ((a.baro_rate ?? 0) * FT) / 60;
    // The report can be up to a minute old. Move the aircraft on to where it is now, so the
    // browser does not start from a position that is kilometres behind.
    const age = onGround ? 0 : Math.min(Math.max(a.seen_pos ?? 0, 0), 60);
    const rad = (track * Math.PI) / 180;
    const lat = a.lat + (Math.cos(rad) * speedMs * age) / 111320;
    const lon = a.lon + (Math.sin(rad) * speedMs * age) / (111320 * Math.cos((a.lat * Math.PI) / 180));
    out.push({
      id: a.hex,
      callsign: (a.flight ?? "").trim(),
      type: a.t ?? "",
      reg: a.r ?? "",
      lat,
      lon,
      altM: onGround ? 0 : typeof a.alt_baro === "number" ? Math.max(a.alt_baro * FT + climbMs * age, 0) : 0,
      onGround,
      speedMs,
      track,
      climbMs,
      roll: a.roll ?? 0,
      category: a.category ?? "",
    });
  }
  return out;
}
