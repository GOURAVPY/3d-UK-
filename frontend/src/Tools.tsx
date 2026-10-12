import { useState } from "react";
import { STREAMS } from "./data/streams";

const AIRPORTS = [
  { name: "Heathrow", lon: -0.4543, lat: 51.47 },
  { name: "London City", lon: 0.0553, lat: 51.5053 },
];

interface Props {
  mode: "auto" | "day" | "night";
  night: boolean;
  onCycleMode: () => void;
  onFlyTo: (lon: number, lat: number) => void;
}

// Airport shortcuts and the list of public live streams.
export function Tools({ mode, night, onCycleMode, onFlyTo }: Props) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const playingStream = STREAMS.find((s) => s.id === playing);

  return (
    <div className="tools">
      <button onClick={onCycleMode} title="Switch between automatic, day and night">
        {night ? "🌙" : "☀️"} {mode === "auto" ? "Auto" : mode === "day" ? "Day" : "Night"}
      </button>
      {AIRPORTS.map((a) => (
        <button key={a.name} onClick={() => onFlyTo(a.lon, a.lat)}>✈ {a.name}</button>
      ))}
      <button onClick={() => setOpen((o) => !o)}>Live streams {open ? "▴" : "▾"}</button>
      {open && (
        <div className="streams">
          {STREAMS.map((s) =>
            s.youtubeId ? (
              <a key={s.id} href="#" onClick={(e) => { e.preventDefault(); setPlaying(s.id); }}>{s.name}</a>
            ) : (
              <a key={s.id} href={s.url} target="_blank" rel="noreferrer">{s.name} ↗</a>
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
    </div>
  );
}
