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
