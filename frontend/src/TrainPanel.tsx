import type { Train } from "./types";
import { minutes, shortName } from "./format";

interface Props {
  train: Train;
  following: boolean;
  onFollow: () => void;
  onClose: () => void;
}

// Details of one clicked train, with a Follow button.
export function TrainPanel({ train, following, onFollow, onClose }: Props) {
  const arrive = new Date(train.expectedArrival).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="panel">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h3><i className="dot" style={{ background: train.colour }} />{train.lineName} line</h3>
      <dl>
        <dt>Destination</dt>
        <dd>{shortName(train.destination) || "Not shown"}</dd>
        <dt>Next station</dt>
        <dd>{shortName(train.nextStation)}</dd>
        <dt>Arrives</dt>
        <dd>{arrive} · {minutes(train.secondsToNext)}</dd>
        <dt>Platform</dt>
        <dd>{train.platform || "Not shown"}</dd>
        {train.currentLocation && (
          <>
            <dt>Now</dt>
            <dd>{train.currentLocation}</dd>
          </>
        )}
      </dl>
      <div className="row">
        <button className={following ? "on" : ""} onClick={onFollow}>
          {following ? "Stop following" : "Follow this train"}
        </button>
        <small>Position is estimated from arrival times</small>
      </div>
    </div>
  );
}
