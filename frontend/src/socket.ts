import { io, type Socket } from "socket.io-client";

// One WebSocket for the whole page. The three live feeds (trains, aircraft, status) used
// to open a connection each, which tripled the server's connections for nothing.
let shared: Socket | null = null;

// Backend address in production (e.g. a Render web service); empty in dev, where Vite proxies /api.
const BACKEND = ((import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "").replace(/\/$/, "");

/** fetch() for our own /api paths, sent to the backend wherever it is hosted. */
export const apiFetch = (path: string, init?: RequestInit) => fetch(BACKEND + path, init);

export function socket(): Socket {
  shared ??= BACKEND ? io(BACKEND) : io();
  return shared;
}
