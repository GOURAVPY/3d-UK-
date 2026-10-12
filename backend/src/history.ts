// Records every poll so the browser can replay the last 24 hours at high speed.
//
// One JSON line per poll, in data/history.jsonl:  {"t": ms, "r": [row, row, ...]}
// A row is the minimum the 3D layer needs to place a train, with station ids and line ids
// replaced by their position in a table that is saved next to the file:
//   [line, vehicle, from, to, before, after, d0, d1, heading]
// The file is only indexed in memory (time, byte offset, length); slices are read on request.
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync, appendFileSync,
} from "node:fs";
import type { Train } from "./arrivals.js";
import type { Line } from "./lines.js";

const DIR = "data";
const FILE = `${DIR}/history.jsonl`;
const META = `${DIR}/history-meta.json`;
const KEEP_MS = 24 * 3600 * 1000;

interface Entry { t: number; off: number; len: number }
let index: Entry[] = [];
let stations: string[] = [];
let stationIdx = new Map<string, number>();
let lineIds: string[] = [];
let lastTrim = 0;

export function initHistory(lines: Line[]) {
  stations = [...new Set(lines.flatMap((l) => l.stations.map((s) => s.id)))].sort();
  stationIdx = new Map(stations.map((s, i) => [s, i]));
  lineIds = lines.map((l) => l.id).sort();
  mkdirSync(DIR, { recursive: true });

  // History written with a different station or line table cannot be decoded: start again.
  const meta = JSON.stringify({ stations, lineIds });
  if (!existsSync(META) || readFileSync(META, "utf8") !== meta) {
    writeFileSync(META, meta);
    writeFileSync(FILE, "");
  }
  if (!existsSync(FILE)) writeFileSync(FILE, "");

  // Rebuild the in-memory index from what is on disk.
  index = [];
  const buf = readFileSync(FILE);
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 10) continue;
    const head = buf.subarray(start, Math.min(start + 40, i)).toString();
    const m = /^\{"t":(\d+)/.exec(head);
    if (m) index.push({ t: Number(m[1]), off: start, len: i - start });
    start = i + 1;
  }
  trim(Date.now());
  console.log(`History: ${index.length} snapshots, ${(buf.length / 1e6).toFixed(1)} MB on disk`);
}

export function recordSnapshot(trains: Train[], t = Date.now()) {
  const rows = [];
  for (const tr of trains) {
    if (tr.ids.length < 2) continue;
    const line = lineIds.indexOf(tr.lineId);
    const from = stationIdx.get(tr.ids[tr.fromIndex]);
    const to = stationIdx.get(tr.ids[tr.fromIndex + 1]);
    if (line < 0 || from === undefined || to === undefined) continue;
    const before = tr.fromIndex > 0 ? (stationIdx.get(tr.ids[0]) ?? -1) : -1;
    const after = tr.ids.length > tr.fromIndex + 2 ? (stationIdx.get(tr.ids[tr.fromIndex + 2]) ?? -1) : -1;
    rows.push([
      line, tr.id.slice(tr.lineId.length + 1), from, to, before, after,
      Math.round(tr.d0), Math.round(tr.d1), Math.round(tr.heading),
    ]);
  }
  const text = JSON.stringify({ t, r: rows }) + "\n";
  const off = statSync(FILE).size;
  appendFileSync(FILE, text);
  index.push({ t, off, len: Buffer.byteLength(text) - 1 });
  if (t - lastTrim > 3600_000) trim(t);
}

// Drop everything older than 24 h, rewriting the file from the slices that are kept.
function trim(now: number) {
  lastTrim = now;
  const keep = index.filter((e) => e.t >= now - KEEP_MS);
  if (keep.length === index.length) return;
  const fd = openSync(FILE, "r");
  const chunks: Buffer[] = [];
  const next: Entry[] = [];
  let off = 0;
  for (const e of keep) {
    const b = Buffer.alloc(e.len + 1);
    readSync(fd, b, 0, e.len + 1, e.off);
    chunks.push(b);
    next.push({ t: e.t, off, len: e.len });
    off += b.length;
  }
  closeSync(fd);
  writeFileSync(FILE, Buffer.concat(chunks));
  index = next;
}

export function historyInfo() {
  return {
    from: index[0]?.t ?? null,
    to: index.at(-1)?.t ?? null,
    count: index.length,
    stations,
    lines: lineIds,
  };
}

// Snapshots with from <= t <= to, at most `limit`, evenly thinned when there are more.
export function readHistory(from: number, to: number, limit = 400) {
  const inRange = index.filter((e) => e.t >= from && e.t <= to);
  const stepBy = Math.max(1, Math.ceil(inRange.length / limit));
  const fd = openSync(FILE, "r");
  const out: { t: number; r: unknown[] }[] = [];
  try {
    for (let i = 0; i < inRange.length; i += stepBy) {
      const e = inRange[i];
      const b = Buffer.alloc(e.len);
      readSync(fd, b, 0, e.len, e.off);
      out.push(JSON.parse(b.toString()));
    }
  } finally {
    closeSync(fd);
  }
  return out;
}
