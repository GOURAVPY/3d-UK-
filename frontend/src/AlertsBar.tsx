import { useState } from "react";
import type { LineStatus } from "./types";

// A small pill that appears only when something is wrong, and opens into TfL's own words.
export function AlertsBar({ status }: { status: LineStatus[] }) {
  const [open, setOpen] = useState(false);
  const bad = status.filter((s) => s.severity < 10).sort((a, b) => a.severity - b.severity);
  if (!bad.length) return null;
  const severe = bad.some((s) => s.severity <= 6);

  return (
    <div className={`alerts ${severe ? "severe" : ""}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        ⚠ {bad.length} {bad.length === 1 ? "line" : "lines"} with {severe ? "severe " : ""}delays {open ? "▴" : "▾"}
      </button>
      {open && (
        <ul>
          {bad.map((s) => (
            <li key={s.lineId}>
              <b>{s.lineName}</b> <span>{s.text}</span>
              {s.reason && <p>{s.reason.replace(/^[^:]*:\s*/, "")}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
