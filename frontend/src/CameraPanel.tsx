import { useEffect, useState } from "react";
import type { Camera } from "./types";

// Live view of one TfL JamCam. The still image refreshes about every 10 s.
export function CameraPanel({ camera, onClose }: { camera: Camera; onClose: () => void }) {
  const [tick, setTick] = useState(0);
  const [clip, setClip] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => setClip(false), [camera.id]);

  return (
    <div className="panel">
      <button className="close" onClick={onClose} aria-label="Close">×</button>
      <h3>{camera.name}</h3>
      {clip ? (
        <video src={camera.videoUrl} autoPlay muted loop controls playsInline />
      ) : (
        <img src={`${camera.imageUrl}?t=${tick}`} alt={camera.name} />
      )}
      <div className="row">
        <button onClick={() => setClip((c) => !c)}>{clip ? "Show image" : "Play clip"}</button>
        <small>TfL traffic camera · image refreshes every 10 s</small>
      </div>
    </div>
  );
}
