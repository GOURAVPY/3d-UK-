# Workflow

## Rules
- **Commit every ~5 lines of change.** Small, focused commits with a clear message (rule is in `CLAUDE.md`).
- Never commit secrets. `backend/.env` is git-ignored. Use `backend/.env.example` as the template.
- Add a journal entry each session and fill in `WEEKLY.md` each Friday.

## Run it
```bash
# terminal 1
cd backend && npm run dev      # http://localhost:3001
# terminal 2
cd frontend && npm run dev     # http://localhost:5173
```
Check: `curl localhost:3001/api/health` returns `{"ok":true,"lines":19}`.

## Environment (`backend/.env`)
```
TFL_APP_KEY=<primary key>
TFL_APP_KEY_BACKUP=<secondary key>
PORT=3001
```

## Repo layout
```
backend/   Node + Express + Socket.IO API (see the README for a file-by-file map)
frontend/  Vite + React + MapLibre GL + Three.js
docs/      this folder

Run everything from the repo root: `npm run setup` once, then `npm run dev`. Before pushing: `npm run typecheck` and
`npm run format` (CI runs both, plus the build).
```

## Weekly cycle
1. Read the week's goal in `WEEKLY.md`.
2. Build in small steps, commit often, push at the end of each session.
3. Log problems and decisions in `JOURNAL.md`.
4. Friday: fill in done / not done / lessons, set next week's goal.

## Deploy
1. **Backend on Render:** New > Blueprint, pick this repo (it reads `render.yaml`). Set `TFL_APP_KEY` in the dashboard. Check `https://<service>.onrender.com/api/health`.
2. If the Render URL is not `live-city-backend.onrender.com`, change it in `frontend/vercel.json`.
3. **Frontend on Vercel:** import the repo, root directory `frontend`. Add env `VITE_BACKEND_URL=https://<service>.onrender.com`. Deploy.
Render's free plan sleeps after 15 min idle, and history restarts empty after each sleep.

### Free option: everything on Render, no Blueprint
Blueprints can ask for a card. Two free services made by hand work instead:
1. **New > Web Service**, repo `GOURAVPY/3d-UK-`, root directory `backend`, build `npm ci --include=dev`, start `npm start`, plan Free. Add env `TFL_APP_KEY`.
2. **New > Static Site**, same repo, root directory `frontend`, build `npm ci && npm run build`, publish directory `dist`. Add env `VITE_BACKEND_URL` = the web service address (no trailing slash).
The page calls the backend directly (CORS is open), so no rewrite rules are needed.
