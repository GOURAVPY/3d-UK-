import { LINE_COLOURS } from "./lineColours.js";
import { tfl } from "./tfl.js";

export interface StationDetails {
  id: string;
  name: string;
  zone: string;
  modes: string[]; // everything that serves it: tube, bus, national-rail ...
  lines: { id: string; name: string; colour: string }[]; // the lines drawn on our map
  address: string;
  phone: string;
  facilities: Record<string, string>; // WiFi: "yes", Lifts: "1", ...
}

interface Raw {
  naptanId: string;
  commonName: string;
  modes?: string[];
  lines?: { id: string; name: string }[];
  additionalProperties?: { category: string; key: string; value: string }[];
}

const cache = new Map<string, { at: number; data: StationDetails }>();
const TTL_MS = 3600_000; // station facts hardly ever change

export async function stationDetails(id: string): Promise<StationDetails> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const raw = await tfl<Raw>(`/StopPoint/${id}`);
  const props = raw.additionalProperties ?? [];
  const find = (category: string, key?: string) =>
    props.find((p) => p.category === category && (!key || p.key === key))?.value ?? "";
  const facilities: Record<string, string> = {};
  for (const p of props) {
    if (p.category === "Facility" && p.key !== "Other Facilities") facilities[p.key] = p.value;
  }
  const seen = new Set<string>();
  const lines = (raw.lines ?? [])
    .filter((l) => LINE_COLOURS[l.id] && !seen.has(l.id) && !!seen.add(l.id))
    .map((l) => ({ id: l.id, name: l.name, colour: LINE_COLOURS[l.id] }));
  const data: StationDetails = {
    id: raw.naptanId,
    name: raw.commonName,
    zone: find("Geo", "Zone"),
    modes: raw.modes ?? [],
    lines,
    address: find("Address", "Address"),
    phone: find("Address", "PhoneNo"),
    facilities,
  };
  cache.set(id, { at: Date.now(), data });
  return data;
}
