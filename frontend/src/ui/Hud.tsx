import { londonClock } from "../daynight";

interface Props {
  trains: number;
  aircraft: number;
  now: Date;
  updatedAt: Date | null;
  playback: boolean;
}

// Top-right card: how many trains are running, with a live pulse and London time.
export function Hud({ trains, aircraft, now, updatedAt, playback }: Props) {
  return (
    <section className="hud" aria-live="polite">
      <div className="state">
        <span className={`pulse${playback ? " amber" : ""}`} />
        {playback ? "PLAYBACK" : "LIVE"}
        <span className="clock">London {londonClock(now)}</span>
      </div>
      <div className="figures">
        <div>
          <b>{trains}</b>
          <span>trains</span>
        </div>
        <div>
          <b>{aircraft}</b>
          <span>aircraft</span>
        </div>
      </div>
      {updatedAt && !playback && <small>updated {updatedAt.toLocaleTimeString("en-GB")}</small>}
    </section>
  );
}
