import { useCallback, useEffect, useRef, useState } from "react";
import type { Line, Train } from "./types";
import { Icon } from "./ui/Icon";

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

const WINDOW_MS = 20 * 60_000; // how much history to fetch at a time

// Speed steps as in Mini Tokyo 3D's Playback Mode: 1 to 10 by 1, 10 to 100 by 10,
// 100 to 600 by 100.
const stepSpeed = (speed: number, dir: 1 | -1) => {
  const step = dir > 0 ? (speed < 10 ? 1 : speed < 100 ? 10 : 100) : speed <= 10 ? 1 : speed <= 100 ? 10 : 100;
  return Math.min(600, Math.max(1, speed + dir * step));
};

interface Props {
  lines: Line[];
  onFrame: (trains: Train[], glideMs: number) => void;
  onClose: () => void;
}

const londonTime = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", {
    timeZone: "Europe/London", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

// London's offset from UTC at a moment (60 or 0 minutes), so dates typed in London
// time can be turned back into a timestamp.
function londonOffsetMs(ms: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(ms).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - ms) / 1000) * 1000;
}
const toLondonInputs = (ms: number) => {
  const d = new Date(ms + londonOffsetMs(ms)).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 19) };
};
const fromLondonInputs = (date: string, time: string) => {
  const guess = Date.parse(`${date}T${time.length === 5 ? time + ":00" : time}Z`);
  return guess - londonOffsetMs(guess);
};

// Playback Mode: the server keeps every poll of the last 24 hours; the browser plays them
// back at up to 600 times real speed and the 3D layer slides trains between snapshots.
export function ReplayBar({ lines, onFrame, onClose }: Props) {
  const [info, setInfo] = useState<Info | null>(null);
  const [vt, setVt] = useState(0); // the moment being shown, ms since 1970
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(60);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ date: "", time: "" });
  const speedRef = useRef(speed);
  speedRef.current = speed;
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

  const pending = useRef<number | null>(null);
  const load = useCallback(async (from: number) => {
    if (pending.current === from) return; // already on its way
    pending.current = from;
    const to = from + WINDOW_MS;
    const res = await fetch(`/api/history?from=${Math.floor(from)}&to=${Math.floor(to)}`);
    snaps.current = (await res.json()) as Snapshot[];
    loaded.current = { from, to };
    lastShown.current = -1;
    pending.current = null;
    setVt((v) => v + 0.001); // re-run the frame effect now the window is here
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

  // Time passes `speed` times faster than on the clock.
  useEffect(() => {
    if (!info?.from || !info.to || !playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setVt((v) => {
        const next = v + dt * speedRef.current;
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
      // snapshots are 30 s apart: at speed x one arrives every 30/x real seconds
      onFrame(decode(pick), Math.max(120, 30_000 / speedRef.current));
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
  const openEditor = () => {
    setPlaying(false);
    setDraft(toLondonInputs(vt));
    setEditing(true);
  };
  const confirm = () => {
    const ms = fromLondonInputs(draft.date, draft.time);
    if (Number.isFinite(ms)) setVt(Math.min(info.to!, Math.max(info.from!, ms)));
    setEditing(false);
  };

  return (
    <div className="replay">
      {editing ? (
        <>
          <div className="editor">
            <label>
              Date (London)
              <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label>
              Time
              <input type="time" step={1} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
            </label>
            <small>Recorded: {londonTime(info.from)} to {londonTime(info.to)}</small>
          </div>
          <button onClick={confirm}>OK</button>
          <button onClick={() => setEditing(false)}>Cancel</button>
        </>
      ) : (
        <>
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
            <Icon name={playing ? "pause" : "play"} size={18} />
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
            aria-label="Playback time"
          />
          <div className="when">
            <b>{londonTime(vt)}</b>
            <small>{spanMin < 120 ? `${spanMin} min` : `${(spanMin / 60).toFixed(1)} h`} recorded</small>
            <button className="link" onClick={openEditor}>Edit date &amp; time</button>
          </div>
          <div className="speed" aria-label="Playback speed">
            <button onClick={() => setSpeed((s) => stepSpeed(s, -1))} aria-label="Slower">
              <Icon name="minus" size={14} />
            </button>
            <span>{speed}×</span>
            <button onClick={() => setSpeed((s) => stepSpeed(s, 1))} aria-label="Faster">
              <Icon name="plus" size={14} />
            </button>
          </div>
          <button onClick={onClose}>Live</button>
        </>
      )}
    </div>
  );
}
