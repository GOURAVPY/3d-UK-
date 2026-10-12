import { useState } from "react";
import { STREAMS } from "../data/streams";
import { Icon, type IconName } from "./Icon";

const AIRPORTS = [
  { code: "LHR", name: "Heathrow", lon: -0.4543, lat: 51.47 },
  { code: "LCY", name: "London City", lon: 0.0553, lat: 51.5053 },
];

interface BtnProps {
  icon: IconName;
  tip: string;
  on?: boolean;
  badge?: string;
  label?: string;
  onClick: () => void;
}

// One icon button. The tooltip is also the accessible name.
function Btn({ icon, tip, on, badge, label, onClick }: BtnProps) {
  return (
    <button
      className={`ibtn${on ? " on" : ""}`}
      data-tip={tip}
      aria-label={tip}
      aria-pressed={on === undefined ? undefined : on}
      onClick={onClick}
    >
      <Icon name={icon} />
      {label && <span className="lbl">{label}</span>}
      {badge && <span className="badge">{badge}</span>}
    </button>
  );
}

interface Props {
  mode: "auto" | "day" | "night";
  night: boolean;
  onCycleMode: () => void;
  eco: boolean;
  onToggleEco: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  underground: boolean;
  onToggleUnderground: () => void;
  replay: boolean;
  onToggleReplay: () => void;
  onFlyTo: (lon: number, lat: number) => void;
}

// The control strip down the right edge: display modes, then jump-to places and live streams.
export function Toolbar(p: Props) {
  const [streams, setStreams] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const playingStream = STREAMS.find((s) => s.id === playing);
  const modeName = p.mode === "auto" ? "Automatic" : p.mode === "day" ? "Day" : "Night";

  return (
    <nav className="toolbar" aria-label="Map controls">
      <div className="group">
        <Btn
          icon={p.night ? "moon" : "sun"}
          tip={`Theme: ${modeName}. Click to change`}
          badge={p.mode === "auto" ? "A" : undefined}
          onClick={p.onCycleMode}
        />
        <Btn icon="battery" tip="Eco mode: update less often to save power" on={p.eco} onClick={p.onToggleEco} />
        <Btn
          icon={p.fullscreen ? "shrink" : "expand"}
          tip={p.fullscreen ? "Leave full screen (Esc)" : "Full screen"}
          onClick={p.onToggleFullscreen}
        />
      </div>

      <div className="group">
        <Btn
          icon="eye"
          tip="Underground mode: station layouts and tunnels"
          on={p.underground}
          onClick={p.onToggleUnderground}
        />
        <Btn
          icon="play"
          tip="Playback: review the recorded day at up to 600 times speed"
          on={p.replay}
          onClick={p.onToggleReplay}
        />
      </div>

      <div className="group">
        {AIRPORTS.map((a) => (
          <Btn
            key={a.code}
            icon="plane"
            label={a.code}
            tip={`Fly to ${a.name}`}
            onClick={() => p.onFlyTo(a.lon, a.lat)}
          />
        ))}
        <Btn icon="video" tip="Live streams" on={streams} onClick={() => setStreams((s) => !s)} />
      </div>

      {streams && (
        <div className="popover" role="dialog" aria-label="Live streams">
          <h4>Live streams</h4>
          {STREAMS.map((s) =>
            s.youtubeId ? (
              <button key={s.id} className="link-row" onClick={() => setPlaying(s.id)}>
                {s.name}
              </button>
            ) : (
              <a key={s.id} className="link-row" href={s.url} target="_blank" rel="noreferrer">
                {s.name} <span aria-hidden="true">↗</span>
              </a>
            ),
          )}
          {playingStream?.youtubeId && (
            <iframe
              src={`https://www.youtube.com/embed/${playingStream.youtubeId}?autoplay=1`}
              allow="autoplay; encrypted-media"
              title={playingStream.name}
            />
          )}
          <small>Third-party streams: unofficial, may be offline.</small>
        </div>
      )}
    </nav>
  );
}
