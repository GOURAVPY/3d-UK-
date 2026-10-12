import { useState } from "react";
import { isSmallScreen } from "../device";
import type { Line, LineStatus } from "../types";
import { Icon } from "./Icon";

// Top-left card listing every line in its colour. Lines with a service problem get a tag.
export function Legend({ lines, status }: { lines: Line[]; status: LineStatus[] }) {
  const [open, setOpen] = useState(!isSmallScreen);
  const bad = new Map(status.filter((s) => s.severity < 10).map((s) => [s.lineId, s]));

  return (
    <section className={`legend${open ? " open" : ""}`}>
      <button className="legend-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="layers" size={18} />
        <span>Lines</span>
        <small>{lines.length}</small>
        <Icon name={open ? "up" : "down"} size={16} />
      </button>
      {open && (
        <ul>
          {lines.map((l) => {
            const s = bad.get(l.id);
            return (
              <li key={l.id} title={s ? `${s.text}${s.reason ? `: ${s.reason}` : ""}` : "Good service"}>
                <i style={{ background: l.colour }} />
                <span>{l.name}</span>
                {s && <em className={s.severity <= 6 ? "severe" : ""}>{s.text}</em>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
