import { londonClock } from "../daynight";

interface Props {
  trains: number;
  aircraft: number;
  now: Date;
  updatedAt: Date | null;
  playback: boolean;
}

// Top-right card: how many trains are running, with a live pulse and London time.
const STALE_MS = 90_000; // two missed polls

export function Hud({ trains, aircraft, now, updatedAt, playback }: Props) {
  const stale = !playback && !!updatedAt && now.getTime() - updatedAt.getTime() > STALE_MS;
  return (
    <section className="hud" aria-live="polite">
      <div className="state">
        <span className={`pulse${playback ? " amber" : stale ? " red" : ""}`} />
        {playback ? "PLAYBACK" : stale ? "STALE" : "LIVE"}
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
      {updatedAt && !playback && (
        <small>{stale ? "no update since" : "updated"} {londonClock(updatedAt)}</small>
      )}
    </section>
  );
}
