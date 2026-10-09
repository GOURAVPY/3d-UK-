import { TFL_APP_KEY, TFL_BASE } from "./config.js";

// Fetch JSON from TfL. The key stays on the server and is never sent to the browser.
export async function tfl<T>(path: string): Promise<T> {
  const url = new URL(TFL_BASE + path);
  if (TFL_APP_KEY) url.searchParams.set("app_key", TFL_APP_KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TfL ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}
