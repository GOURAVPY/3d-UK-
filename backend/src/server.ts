import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fetchTrains, type Train } from "./arrivals.js";
import { PORT } from "./config.js";
import { departuresFor } from "./departures.js";
import { applyTracks, loadAllLines, loadTrackFile, type Line } from "./lines.js";
import { LineTracks } from "./positioning.js";

const POLL_MS = 30_000;

const app = express();
app.use(cors());
const http = createServer(app);
const io = new Server(http, { cors: { origin: "*" } });

let lines: Line[] = [];
const tracks = new Map<string, LineTracks>();
let trains: Train[] = [];
let trackShapes: Record<string, [number, number][]> = {};

app.get("/api/health", (_req, res) => res.json({ ok: true, lines: lines.length, trains: trains.length }));
app.get("/api/lines", (_req, res) => res.json(lines));
app.get("/api/trains", (_req, res) => res.json(trains));
// Real track shape per station link, keyed "idA|idB" (A < B), oriented A to B.
app.get("/api/tracks", (_req, res) => res.json(trackShapes));
app.get("/api/stations/:id/arrivals", async (req, res) => {
  const id = req.params.id;
  if (!/^[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: "bad station id" });
  try {
    res.json(await departuresFor(id));
  } catch {
    res.status(502).json({ error: "TfL unavailable" });
  }
});

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
trackShapes = loadTrackFile();
const snapped = applyTracks(lines, trackShapes);
console.log(snapped ? `Real track shapes for ${snapped} links` : "No data/tracks.json: using TfL path shapes");
for (const l of lines) tracks.set(l.id, new LineTracks(l));
console.log(`Loaded ${lines.length} lines`);
await poll();
setInterval(poll, POLL_MS);
http.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
