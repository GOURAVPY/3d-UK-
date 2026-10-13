import { io, type Socket } from "socket.io-client";

// One WebSocket for the whole page. The three live feeds (trains, aircraft, status) used
// to open a connection each, which tripled the server's connections for nothing.
let shared: Socket | null = null;

export function socket(): Socket {
  // In production the page (Vercel) and the backend (Render) live on different hosts.
  // HTTP calls go through a Vercel rewrite; the WebSocket connects to the backend directly.
  const url = import.meta.env.VITE_BACKEND_URL as string | undefined;
  shared ??= url ? io(url) : io();
  return shared;
}
