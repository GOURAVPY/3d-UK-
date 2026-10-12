import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fetchTrains, type Train } from "./arrivals.js";
import { loadCameras, type Camera } from "./cameras.js";
import { PORT } from "./config.js";
import { loadAllLines, type Line } from "./lines.js";
import { LineTracks } from "./positioning.js";

const POLL_MS = 30_000;

const app = express();
app.use(cors());
const http = createServer(app);
const io = new Server(http, { cors: { origin: "*" } });

let lines: Line[] = [];
const tracks = new Map<string, LineTracks>();
let trains: Train[] = [];
let cameras: Camera[] = [];

app.get("/api/health", (_req, res) => res.json({ ok: true, lines: lines.length, trains: trains.length }));
app.get("/api/lines", (_req, res) => res.json(lines));
app.get("/api/trains", (_req, res) => res.json(trains));
app.get("/api/cameras", (_req, res) => res.json(cameras));

// New browsers get the latest trains straight away.
io.on("connection", (socket) => socket.emit("trains", trains));

async function poll() {
  try {
    trains = await fetchTrains(lines, tracks, POLL_MS / 1000);
    io.emit("trains", trains);
    console.log(`${new Date().toISOString()} ${trains.length} trains`);
  } catch (err) {
    console.error("poll failed", err);
  }
}

// Static data is loaded once at startup, then arrivals every 30 s.
lines = await loadAllLines();
for (const l of lines) tracks.set(l.id, new LineTracks(l));
console.log(`Loaded ${lines.length} lines`);
await poll();
cameras = await loadCameras().catch(() => []);
console.log(`Loaded ${cameras.length} cameras`);
setInterval(poll, POLL_MS);
http.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
