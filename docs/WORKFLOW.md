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
backend/   Express + TypeScript server (src/: config, tfl, lines, lineColours, server)
frontend/  Vite + React + TypeScript + MapLibre (src/: App, drawLines, types)
docs/      this folder
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
