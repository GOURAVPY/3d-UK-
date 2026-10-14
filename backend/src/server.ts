import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fetchTrains, stopsFor, type Train } from "./arrivals.js";
import { PORT } from "./config.js";
import { existsSync, readFileSync } from "node:fs";
import { departuresFor } from "./departures.js";
import { historyInfo, initHistory, readHistory, recordSnapshot } from "./history.js";
import { fetchFlights, type Flight } from "./flights.js";
import { stationPhoto, trainPhoto } from "./photos.js";
import { stationDetails } from "./stationDetails.js";
import { fetchStatus, type LineStatus } from "./status.js";
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
let flights: Flight[] = [];
let status: LineStatus[] = [];
let trackShapes: Record<string, [number, number][]> = {};
// Underground / elevated stretches of each link: [[metresFromStart, level], ...] (-1, 0, 1).
const levels: Record<string, [number, number][]> = existsSync("data/levels.json")
  ? JSON.parse(readFileSync("data/levels.json", "utf8"))
  : {};
// Station buildings, platforms, passages and entrances, for Underground Mode.
const layout = existsSync("data/station-layout.json")
  ? JSON.parse(readFileSync("data/station-layout.json", "utf8"))
  : { type: "FeatureCollection", features: [] };
// How far to the left of its stored direction each link is drawn when lines share a corridor.
const lanes: Record<string, number> = existsSync("data/lanes.json")
  ? JSON.parse(readFileSync("data/lanes.json", "utf8"))
  : {};

app.get("/api/health", (_req, res) => res.json({ ok: true, lines: lines.length, trains: trains.length }));
app.get("/api/lines", (_req, res) => res.json(lines));
app.get("/api/trains", (_req, res) => res.json(trains));
app.get("/api/flights", (_req, res) => res.json(flights));
app.get("/api/status", (_req, res) => res.json(status));
// Replay: what has been recorded, and slices of it.
app.get("/api/history/info", (_req, res) => res.json(historyInfo()));
app.get("/api/history", (req, res) => {
  const from = Number(req.query.from);
  const to = Number(req.query.to);
  if (!Number.isFinite(from) || !Number.isFinite(to))
    return res.status(400).json({ error: "from and to are required" });
  res.json(readHistory(from, to, 400));
});
// Upcoming stops of one train (id like "victoria:213"), for its timeline panel.
app.get("/api/trains/:id/stops", (req, res) => {
  if (!/^[a-z-]+:[A-Za-z0-9_-]+$/.test(req.params.id)) return res.status(400).json({ error: "bad train id" });
  const stops = stopsFor(req.params.id);
  if (!stops) return res.status(404).json({ error: "train not found" });
  res.json(stops);
});
// Real track shape per line and station link, keyed "lineId|idA|idB" (A < B), oriented A to B.
app.get("/api/tracks", (_req, res) => res.json(trackShapes));
app.get("/api/lanes", (_req, res) => res.json(lanes));
app.get("/api/levels", (_req, res) => res.json(levels));
app.get("/api/layout", (_req, res) => res.json(layout));
// Real photos from Wikipedia: the train type a line runs, and the station itself.
app.get("/api/lines/:id/photo", async (req, res) => {
  try {
    res.json(await trainPhoto(req.params.id));
  } catch {
    res.status(502).json({ error: "Wikipedia unavailable" });
  }
});
app.get("/api/stations/:id/photo", async (req, res) => {
  const name = lines.flatMap((l) => l.stations).find((s) => s.id === req.params.id)?.name;
  if (!name) return res.status(404).json({ error: "unknown station" });
  try {
    res.json(await stationPhoto(req.params.id, name));
  } catch {
    res.status(502).json({ error: "Wikipedia unavailable" });
  }
});
app.get("/api/stations/:id/details", async (req, res) => {
  const id = req.params.id;
  if (!/^[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: "bad station id" });
  try {
    res.json(await stationDetails(id));
  } catch {
    res.status(502).json({ error: "TfL unavailable" });
  }
});
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
io.on("connection", (socket) => {
  socket.emit("trains", trains);
  socket.emit("flights", flights);
  socket.emit("status", status);
});

async function poll() {
  try {
    trains = await fetchTrains(lines, tracks, POLL_MS / 1000);
    io.emit("trains", trains);
    recordSnapshot(trains);
    console.log(`${new Date().toISOString()} ${trains.length} trains`);
  } catch (err) {
    console.error("poll failed", err);
  }
}

async function pollFlights() {
  try {
    flights = await fetchFlights();
    io.emit("flights", flights);
  } catch (err) {
    console.error("flights poll failed", err instanceof Error ? err.message : err);
  }
}

async function pollStatus() {
  try {
    status = await fetchStatus();
    io.emit("status", status);
  } catch (err) {
    console.error("status poll failed", err instanceof Error ? err.message : err);
  }
}

// Static data is loaded once at startup, then arrivals every 30 s.
lines = await loadAllLines();
trackShapes = loadTrackFile();
const snapped = applyTracks(lines, trackShapes);
console.log(snapped ? `Real track shapes for ${snapped} links` : "No data/tracks.json: using TfL path shapes");
for (const l of lines) tracks.set(l.id, new LineTracks(l));
initHistory(lines);
console.log(`Loaded ${lines.length} lines`);
await poll();
setInterval(poll, POLL_MS);
await pollFlights();
console.log(`${flights.length} aircraft`);
setInterval(pollFlights, 10_000);
await pollStatus();
setInterval(pollStatus, 120_000);
http.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
