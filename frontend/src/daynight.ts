// Is it dark in London right now? Computed from the sun's height, not a fixed clock time,
// so the map goes dark at real sunset (early in winter, late in summer).
const LAT = 51.5;
const LON = -0.12;
const RAD = Math.PI / 180;

// Sun elevation above the horizon in degrees (standard low-precision astronomical formulae).
export function sunElevation(date: Date, lat = LAT, lon = LON): number {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545; // days since J2000
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const hour = (gmst * 15 + lon) * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(hour)) / RAD;
}

// The sun is down (a little below the horizon, so dusk reads as evening, not night).
export function isNight(date: Date): boolean {
  return sunElevation(date) < -1.5;
}

// "17:46" in London, whatever timezone the viewer is in.
export function londonClock(date: Date): string {
  return date.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
}

export type ThemeMode = "auto" | "day" | "night";

export const STYLE_DAY = "https://tiles.openfreemap.org/styles/positron";
export const STYLE_NIGHT = "https://tiles.openfreemap.org/styles/dark";

// On a dark map a black line disappears, so very dark colours are mixed toward light grey.
export function liftDark(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum > 0.22) return hex;
  const k = 0.7 - lum * 2; // the darker, the more it is lifted
  const mix = (c: number) => Math.round(c + (225 - c) * k);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
