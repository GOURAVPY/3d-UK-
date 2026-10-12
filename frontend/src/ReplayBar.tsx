import { useCallback, useEffect, useRef, useState } from "react";
import type { Line, Train } from "./types";

interface Info {
  from: number | null;
  to: number | null;
  count: number;
  stations: string[];
  lines: string[];
}
interface Snapshot {
  t: number;
  r: (number | string)[][];
}

const SPEED = 60; // one real second is one minute of the day
const WINDOW_MS = 20 * 60_000; // how much history to fetch at a time

interface Props {
  lines: Line[];
  onFrame: (trains: Train[], glideMs: number) => void;
  onClose: () => void;
}

const londonTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    timeZone: "Europe/London", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

// Replays recorded history: the server keeps every poll of the last 24 hours, the browser
// plays them back 60 times faster and the 3D layer slides trains between snapshots.
export function ReplayBar({ lines, onFrame, onClose }: Props) {
  const [info, setInfo] = useState<Info | null>(null);
  const [vt, setVt] = useState(0); // the moment being shown, ms since 1970
  const [playing, setPlaying] = useState(true);
  const snaps = useRef<Snapshot[]>([]);
  const loaded = useRef<{ from: number; to: number } | null>(null);
  const lastShown = useRef(-1);
  const meta = useRef<{
    colour: Map<string, string>;
    name: Map<string, string>;
    at: Map<string, [number, number]>;
  } | null>(null);

  useEffect(() => {
    meta.current = {
      colour: new Map(lines.map((l) => [l.id, l.colour])),
      name: new Map(lines.map((l) => [l.id, l.name])),
      at: new Map(lines.flatMap((l) => l.stations.map((s) => [s.id, [s.lon, s.lat] as [number, number]]))),
    };
  }, [lines]);

  useEffect(() => {
    fetch("/api/history/info")
      .then((r) => r.json())
      .then((i: Info) => {
        setInfo(i);
        if (i.from) setVt(i.from);
      })
      .catch(() => setInfo({ from: null, to: null, count: 0, stations: [], lines: [] }));
  }, []);

  const load = useCallback(async (from: number) => {
    const to = from + WINDOW_MS;
    const res = await fetch(`/api/history?from=${Math.floor(from)}&to=${Math.floor(to)}`);
    snaps.current = (await res.json()) as Snapshot[];
    loaded.current = { from, to };
    lastShown.current = -1;
  }, []);

  const decode = useCallback(
    (s: Snapshot): Train[] => {
      if (!info || !meta.current) return [];
      const { colour, name, at } = meta.current;
      const out: Train[] = [];
      for (const r of s.r) {
        const lineId = info.lines[r[0] as number];
        const from = info.stations[r[2] as number];
        const to = info.stations[r[3] as number];
        if (!lineId || !from || !to) continue;
        const before = (r[4] as number) >= 0 ? info.stations[r[4] as number] : null;
        const after = (r[5] as number) >= 0 ? info.stations[r[5] as number] : null;
        const ids = [...(before ? [before] : []), from, to, ...(after ? [after] : [])];
        const here = at.get(to) ?? [0, 0];
        out.push({
          id: `${lineId}:${r[1]}`,
          lineId,
          lineName: name.get(lineId) ?? lineId,
          colour: colour.get(lineId) ?? "#888888",
          nextStationId: to,
          nextStation: "",
          destination: "",
          platform: "",
          currentLocation: "",
          secondsToNext: 0,
          expectedArrival: new Date(s.t).toISOString(),
          lat: here[1],
          lon: here[0],
          toLat: here[1],
          toLon: here[0],
          heading: r[8] as number,
          ids,
          fromIndex: before ? 1 : 0,
          d0: r[6] as number,
          d1: r[7] as number,
        });
      }
      return out;
    },
    [info],
  );

  // Time passes SPEED times faster than on the clock.
  useEffect(() => {
    if (!info?.from || !info.to || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setVt((v) => {
        const next = v + dt * SPEED;
        if (next >= info.to!) {
          setPlaying(false);
          return info.to!;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [info, playing]);

  // Show the latest snapshot at or before the current moment, fetching more when needed.
  useEffect(() => {
    if (!info?.from || !vt) return;
    const w = loaded.current;
    if (!w || vt < w.from || vt > w.to - 30_000) {
      void load(Math.max(info.from, vt - 30_000));
      return;
    }
    let pick: Snapshot | null = null;
    for (const s of snaps.current) {
      if (s.t <= vt) pick = s;
      else break;
    }
    if (pick && pick.t !== lastShown.current) {
      lastShown.current = pick.t;
      onFrame(decode(pick), Math.max(200, 30_000 / SPEED));
    }
  }, [vt, info, load, decode, onFrame]);

  if (!info) return <div className="replay"><span>Loading history…</span></div>;
  if (!info.from || !info.to || info.count < 2) {
    return (
      <div className="replay">
        <span>Not enough history yet: the server records one snapshot every 30 s.</span>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }

  const spanMin = Math.round((info.to - info.from) / 60000);
  return (
    <div className="replay">
      <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "⏸" : "▶"}
      </button>
      <input
        type="range"
        min={info.from}
        max={info.to}
        step={30_000}
        value={vt}
        onChange={(e) => {
          setPlaying(false);
          setVt(Number(e.target.value));
        }}
        aria-label="Replay time"
      />
      <div className="when">
        <b>{londonTime(vt)}</b>
        <small>{SPEED}× · {spanMin < 120 ? `${spanMin} min` : `${(spanMin / 60).toFixed(1)} h`} recorded</small>
      </div>
      <button onClick={onClose}>Live</button>
    </div>
  );
}
