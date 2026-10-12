import { useEffect, useState } from "react";
import type { Departure } from "./types";
import { minutes, shortName } from "./format";

interface Details {
  id: string;
  name: string;
  zone: string;
  modes: string[];
  lines: { id: string; name: string; colour: string }[];
  address: string;
  phone: string;
  facilities: Record<string, string>;
}

interface Props {
  stationId: string;
  name: string;
  onClose: () => void;
}

const MODE_NAMES: Record<string, string> = {
  tube: "Tube",
  dlr: "DLR",
  overground: "Overground",
  "elizabeth-line": "Elizabeth line",
  "national-rail": "National Rail",
  bus: "Bus",
  tram: "Tram",
  "river-bus": "River bus",
  "cable-car": "Cable car",
  coach: "Coach",
};

// Facilities worth a chip, in order. A value of "no" or "0" is left out.
const FACILITY_LABELS: [string, string][] = [
  ["WiFi", "WiFi"],
  ["Toilets", "Toilets"],
  ["Lifts", "Lifts"],
  ["Escalators", "Escalators"],
  ["Cash Machines", "Cash machines"],
  ["Car park", "Car park"],
  ["Waiting Room", "Waiting room"],
  ["Photo Booths", "Photo booths"],
];

const present = (v: string | undefined) => !!v && v.toLowerCase() !== "no" && !/^0\b/.test(v);

function useJson<T>(url: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => alive && setData(j))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [url]);
  return data;
}

// Station panel: what the station is, then a live departures board styled like a platform screen.
export function StationPanel({ stationId, name, onClose }: Props) {
  const details = useJson<Details>(`/api/stations/${stationId}/details`);
  const [rows, setRows] = useState<Departure[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showInfo, setShowInfo] = useState(true);

  // departures refresh every 15 s
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

  const otherModes = (details?.modes ?? []).filter((m) => !["tube", "dlr", "overground", "elizabeth-line"].includes(m));
  const facilities = FACILITY_LABELS.filter(([key]) => present(details?.facilities[key])).map(([key, label]) => {
    const v = details!.facilities[key];
    return /^\d+$/.test(v) ? `${label} ${v}` : label;
  });

  return (
    <div className="panel board">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h3>
        {shortName(details?.name ?? name)}
        {details?.zone && <span className="zone">Zone {details.zone}</span>}
      </h3>

      {details && (
        <div className="info">
          <button className="more" onClick={() => setShowInfo((s) => !s)}>
            {showInfo ? "Hide details ▴" : "Station details ▾"}
          </button>
          {showInfo && (
            <>
              {details.lines.length > 0 && (
                <div className="chips">
                  {details.lines.map((l) => (
                    <span key={l.id} className="chip" style={{ borderColor: l.colour }}>
                      <i style={{ background: l.colour }} />
                      {l.name}
                    </span>
                  ))}
                </div>
              )}
              {otherModes.length > 0 && (
                <p className="facts">
                  Also: {otherModes.map((m) => MODE_NAMES[m] ?? m).join(" · ")}
                </p>
              )}
              {facilities.length > 0 && <p className="facts">{facilities.join(" · ")}</p>}
              {details.address && <p className="facts addr">{details.address}</p>}
            </>
          )}
        </div>
      )}

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
