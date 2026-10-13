import { useEffect, useState } from "react";
import { apiFetch } from "../socket";

interface PhotoData {
  image: string;
  title: string;
  page: string;
}

// Results are kept for the session, so reopening a panel shows its photo straight away.
const seen = new Map<string, PhotoData | null>();

/** A real photo from Wikipedia, with a credit link. Renders nothing if there isn't one. */
export function Photo({ src, caption }: { src: string; caption?: string }) {
  const [photo, setPhoto] = useState<PhotoData | null | undefined>(seen.get(src));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    if (seen.has(src)) {
      setPhoto(seen.get(src));
      return;
    }
    setPhoto(undefined);
    apiFetch(src)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((p: PhotoData | null) => {
        seen.set(src, p);
        if (alive) setPhoto(p);
      });
    return () => {
      alive = false;
    };
  }, [src]);

  if (photo === null) return null;
  return (
    <figure className={`photo${loaded ? " ready" : ""}`}>
      {photo && <img src={photo.image} alt={photo.title} loading="lazy" onLoad={() => setLoaded(true)} />}
      {photo && (
        <figcaption>
          <span>{caption ?? photo.title}</span>
          <a href={photo.page} target="_blank" rel="noreferrer">
            Wikipedia
          </a>
        </figcaption>
      )}
    </figure>
  );
}
