import cors from "cors";
import express from "express";
import { PORT } from "./config.js";
import { loadAllLines, type Line } from "./lines.js";

const app = express();
app.use(cors());

let lines: Line[] = [];

app.get("/api/health", (_req, res) => res.json({ ok: true, lines: lines.length }));
app.get("/api/lines", (_req, res) => res.json(lines));

// Static data is loaded once at startup, as in the project plan.
lines = await loadAllLines();
console.log(`Loaded ${lines.length} lines`);
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
