// Real photos of trains and stations, from Wikipedia (images are on Wikimedia Commons).
// Wikipedia asks API users to send a User-Agent that says who they are.
const UA = "LiveCity3D/1.0 (https://github.com/GOURAVPY/3d-UK-)";
const WIKI = "https://en.wikipedia.org";

export interface Photo {
  image: string; // thumbnail URL, about 480 px wide
  title: string; // the Wikipedia article it came from
  page: string; // link to that article, shown as the credit
}

// The trains each line runs, as Wikipedia article titles.
const TRAIN_ARTICLE: Record<string, string> = {
  bakerloo: "London Underground 1972 Stock",
  central: "London Underground 1992 Stock",
  "waterloo-city": "London Underground 1992 Stock",
  circle: "London Underground S7 and S8 Stock",
  district: "London Underground S7 and S8 Stock",
  "hammersmith-city": "London Underground S7 and S8 Stock",
  metropolitan: "London Underground S7 and S8 Stock",
  jubilee: "London Underground 1996 Stock",
  northern: "London Underground 1995 Stock",
  piccadilly: "London Underground 1973 Stock",
  victoria: "London Underground 2009 Stock",
  dlr: "Docklands Light Railway B07 Stock",
  elizabeth: "British Rail Class 345",
  liberty: "British Rail Class 710",
  lioness: "British Rail Class 710",
  suffragette: "British Rail Class 710",
  weaver: "British Rail Class 710",
  mildmay: "British Rail Class 378",
  windrush: "British Rail Class 378",
};

const pageUrl = (title: string) => `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
const cache = new Map<string, Photo | null>(); // photos don't change; null = none found

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function trainPhoto(lineId: string): Promise<Photo | null> {
  const title = TRAIN_ARTICLE[lineId];
  if (!title) return null;
  const key = `train:${title}`;
  if (cache.has(key)) return cache.get(key)!;
  const s = await get<{ title: string; thumbnail?: { source: string } }>(
    `${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  );
  const photo = s.thumbnail ? { image: s.thumbnail.source, title: s.title, page: pageUrl(s.title) } : null;
  cache.set(key, photo);
  return photo;
}

// "Warren Street Underground Station" -> "Warren Street"
const baseName = (name: string) =>
  name
    .replace(/-Underground$/i, "") // "Paddington (H&C Line)-Underground"
    .replace(/\s+(Underground|DLR|Rail|Overground)?\s*Station$/i, "")
    .replace(/\s*\(.*\)$/, "")
    .replace(/\bSt\. /g, "St ") // Wikipedia writes "St James's Park"
    .trim();

interface SearchPage { title: string; index: number; thumbnail?: { source: string } }

/** Searches Wikipedia for the station's own article and returns its photo. */
export async function stationPhoto(id: string, name: string): Promise<Photo | null> {
  const key = `station:${id}`;
  if (cache.has(key)) return cache.get(key)!;
  const base = baseName(name);
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrlimit: "8",
    gsrsearch: `${base} intitle:station London`, prop: "pageimages", piprop: "thumbnail", pithumbsize: "480",
  });
  const r = await get<{ query?: { pages: Record<string, SearchPage> } }>(`${WIKI}/w/api.php?${params}`);
  const pages = Object.values(r.query?.pages ?? {}).filter((p) => p.thumbnail).sort((a, b) => a.index - b.index);
  const lower = base.toLowerCase();
  // best: an exact "<name> station" style title; next: the top result whose title starts with the name
  // the kind TfL names ("... DLR Station") decides which same-named article wins
  const kinds = /\bDLR\b/i.test(name) ? ["dlr station"] : /Underground/i.test(name) ? ["tube station"] : [];
  const exact = [...kinds, "station", "tube station", "railway station", "dlr station"].map((s) => `${lower} ${s}`);
  const pick =
    exact.map((t) => pages.find((p) => p.title.toLowerCase() === t)).find(Boolean) ??
    pages.find((p) => p.title.toLowerCase().startsWith(lower) && /station/i.test(p.title)) ??
    pages.find((p) => p.title.toLowerCase().includes(lower) && /stations\b/i.test(p.title)); // "Bank and Monument stations"
  const photo = pick ? { image: pick.thumbnail!.source, title: pick.title, page: pageUrl(pick.title) } : null;
  cache.set(key, photo);
  return photo;
}
