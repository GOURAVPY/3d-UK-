import { useEffect, useState } from "react";
import type { Departure } from "./types";
import { minutes, shortName } from "./format";

interface Props {
  stationId: string;
  name: string;
  onClose: () => void;
}

// Live departures board, styled like a platform screen. Refreshes every 15 s.
export function StationPanel({ stationId, name, onClose }: Props) {
  const [rows, setRows] = useState<Departure[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setFailed(false);
    const load = async () => {
      try {
        const res = await fetch(`/api/stations/${stationId}/arrivals`);
        if (!res.ok) throw new Error(String(res.status));
        const data: Departure[] = await res.json();
        if (alive) {
          setRows(data);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [stationId]);

  return (
    <div className="panel board">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h3>{shortName(name)}</h3>
      {failed && !rows && <p className="muted">Departures are unavailable right now.</p>}
      {!failed && !rows && <p className="muted">Loading departures…</p>}
      {rows && rows.length === 0 && <p className="muted">No trains due.</p>}
      {rows && rows.length > 0 && (
        <ol>
          {rows.map((r, i) => (
            <li key={i}>
              <i className="dot" style={{ background: r.colour }} />
              <span className="dest">{shortName(r.destination) || r.lineName}</span>
              <span className="plat">{r.platform.replace(/ - Platform/, " ·")}</span>
              <b>{minutes(r.seconds)}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
