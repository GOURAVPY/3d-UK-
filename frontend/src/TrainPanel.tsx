import { apiFetch } from "./socket";
import { useEffect, useState } from "react";
import type { Train } from "./types";
import { minutes, shortName } from "./format";
import { Icon } from "./ui/Icon";

interface Stop {
  id: string;
  name: string;
  seconds: number;
  expectedArrival: string;
}

interface Props {
  train: Train;
  following: boolean;
  onFollow: () => void;
  onClose: () => void;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

// Upcoming stops of one train; asked for when it is selected and refreshed with each poll.
function useStops(trainId: string) {
  const [stops, setStops] = useState<Stop[] | null>(null);
  useEffect(() => {
    let alive = true;
    setStops(null);
    const load = async () => {
      try {
        const res = await apiFetch(`/api/trains/${encodeURIComponent(trainId)}/stops`);
        if (res.ok && alive) setStops(await res.json());
      } catch {
        /* keep the last list */
      }
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [trainId]);
  return stops;
}

// One clicked train: its line, where it is going, and a timeline of the stops ahead.
export function TrainPanel({ train, following, onFollow, onClose }: Props) {
  const stops = useStops(train.id);
  const [open, setOpen] = useState(true);
  const destination = shortName(train.destination) || shortName(train.nextStation);

  return (
    <div className="panel train" style={{ ["--line" as string]: train.colour }}>
      <div className="train-head">
        <i className="bar" />
        <div className="title">
          <b>{train.lineName}{/line$/i.test(train.lineName) ? "" : " line"}</b>
          <span>
            <mark>{train.platform.split(" - ")[0] || "Train"}</mark> for {destination}
          </span>
        </div>
        <button className="chev" onClick={() => setOpen((o) => !o)} aria-label={open ? "Hide stops" : "Show stops"}>
          <Icon name={open ? "up" : "down"} size={18} />
        </button>
        <button className="chev" onClick={onClose} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
      </div>

      {open && (
        <ol className="stops">
          {stops === null && <li className="muted">Loading stops…</li>}
          {stops?.length === 0 && <li className="muted">No stops listed.</li>}
          {stops?.map((s, i) => (
            <li key={s.id} className={i === 0 ? "next" : ""}>
              <i className="pip" />
              <span className="name">{shortName(s.name)}</span>
              <span className="when">
                {clock(s.expectedArrival)}
                <small>{minutes(s.seconds)}</small>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="row">
        <button className={following ? "on" : ""} onClick={onFollow}>
          <Icon name="target" size={16} />
          {following ? "Stop following" : "Follow"}
        </button>
        <small>{train.currentLocation || "Position estimated from arrival times"}</small>
      </div>
    </div>
  );
}
