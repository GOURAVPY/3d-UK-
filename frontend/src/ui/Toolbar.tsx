import { useState } from "react";
import { STREAMS } from "../data/streams";
import { Icon, type IconName } from "./Icon";

const AIRPORTS = [
  { code: "LHR", name: "Heathrow", lon: -0.4543, lat: 51.47 },
  { code: "LCY", name: "London City", lon: 0.0553, lat: 51.5053 },
];

// Map layers the viewer can switch off, in the order they are listed.
export const LAYER_NAMES = ["trains", "aircraft", "lines", "stations", "buildings"] as const;
export type LayerName = (typeof LAYER_NAMES)[number];
export type Shown = Record<LayerName, boolean>;
const LAYER_LABELS: Record<LayerName, string> = {
  trains: "Trains",
  aircraft: "Aircraft",
  lines: "Lines and tunnels",
  stations: "Stations",
  buildings: "3D buildings",
};

interface BtnProps {
  icon?: IconName;
  tip: string;
  on?: boolean;
  badge?: string;
  label?: string;
  onClick: () => void;
  children?: React.ReactNode;
}

// One icon button. The tooltip is also the accessible name.
function Btn({ icon, tip, on, badge, label, onClick, children }: BtnProps) {
  return (
    <button
      className={`ibtn${on ? " on" : ""}`}
      data-tip={tip}
      aria-label={tip}
      aria-pressed={on === undefined ? undefined : on}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {children}
      {label && <span className="lbl">{label}</span>}
      {badge && <span className="badge">{badge}</span>}
    </button>
  );
}

// A compass whose needle turns with the map. Red end points north.
function Compass({ bearing }: { bearing: number }) {
  return (
    <svg className="needle" width="22" height="22" viewBox="0 0 24 24" style={{ transform: `rotate(${-bearing}deg)` }} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
      <path d="M12 3 15 12 9 12z" fill="#ff453a" />
      <path d="M12 21 15 12 9 12z" fill="currentColor" opacity="0.45" />
    </svg>
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
  bearing: number;
  onResetNorth: () => void;
  shown: Shown;
  onToggleLayer: (name: LayerName) => void;
  onFlyTo: (lon: number, lat: number) => void;
}

// The control strip down the right edge: display modes, compass and layers, then
// jump-to places and live streams.
export function Toolbar(p: Props) {
  const [open, setOpen] = useState<"streams" | "layers" | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const playingStream = STREAMS.find((s) => s.id === playing);
  const modeName = p.mode === "auto" ? "Automatic" : p.mode === "day" ? "Day" : "Night";
  const toggle = (which: "streams" | "layers") => setOpen((o) => (o === which ? null : which));
  const facing = Math.round(((p.bearing % 360) + 360) % 360);

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
        <Btn tip={facing === 0 ? "Facing north" : `Facing ${facing}°. Click to turn north`} onClick={p.onResetNorth}>
          <Compass bearing={p.bearing} />
        </Btn>
        <Btn icon="layers" tip="Layers: choose what is shown" on={open === "layers"} onClick={() => toggle("layers")} />
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
        <Btn icon="video" tip="Live streams" on={open === "streams"} onClick={() => toggle("streams")} />
      </div>

      {open === "layers" && (
        <div className="popover" role="dialog" aria-label="Layers">
          <h4>Layers</h4>
          {LAYER_NAMES.map((name) => (
            <label key={name} className="check-row">
              <input type="checkbox" checked={p.shown[name]} onChange={() => p.onToggleLayer(name)} />
              <span>{LAYER_LABELS[name]}</span>
            </label>
          ))}
        </div>
      )}

      {open === "streams" && (
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
