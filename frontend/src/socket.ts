import { io, type Socket } from "socket.io-client";

// One WebSocket for the whole page. The three live feeds (trains, aircraft, status) used
// to open a connection each, which tripled the server's connections for nothing.
let shared: Socket | null = null;

export function socket(): Socket {
  shared ??= io();
  return shared;
}
