# QueueStorm — Deployment Runbook

This repo deploys as **two services**: a Node/Express + SQLite **backend** (the graded API) and a React/Vite **frontend**. The backend is fully functional on its own; the LLM (Gemma 4 via Ollama) is optional and never required.

---

## 1. Local replication (what a grader runs)

**Prerequisites:** Node.js ≥ 18 (tested on 22). No GPU. No secrets. Ollama is optional.

```bash
# 1) Backend
cd backend
cp .env.example .env          # defaults are fine; set LLM_ENABLED=false to skip the LLM
npm install
npm run migrate               # creates queuestorm.db (also auto-runs on boot)
npm run seed                  # optional: populate sample tickets for the dashboards
npm start                     # -> http://localhost:8787

# verify
curl http://localhost:8787/health
curl -X POST http://localhost:8787/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"T-001","channel":"app","locale":"en","message":"I sent 3000 to wrong number"}'
```

```bash
# 2) Frontend (separate terminal)
cd frontend
cp .env.example .env          # set VITE_API_BASE_URL=http://localhost:8787
npm install
npm run dev                   # -> http://localhost:5173
# production: npm run build && npm run preview
```

**Run tests** (golden cases + safety + schema, with the LLM off):
```bash
cd backend && LLM_ENABLED=false npm test
```

---

## 2. Environment variables

**Backend** (`backend/.env`) — none are secret:
| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8787` | API port |
| `DATABASE_URL` | `./queuestorm.db` | SQLite file path |
| `LLM_ENABLED` | `true` | set `false` for pure rules (still fully valid) |
| `OLLAMA_HOST` | `http://localhost:11434` | local Ollama, CPU only |
| `GEMMA_MODEL` | `gemma4` | model tag |
| `GEMMA_TIMEOUT_MS` | `6000` | LLM call timeout → rules fallback |
| `CORS_ORIGIN` | `*` | frontend origin |

**Frontend** (`frontend/.env`):
| Var | Example | Meaning |
|-----|---------|---------|
| `VITE_API_BASE_URL` | `https://your-api.onrender.com` | backend base URL |

---

## 3. Hosting the backend (pick one)

The backend is a standard Node service. `npm start` runs `node src/server.js` and binds `PORT`.

- **Render / Railway / Fly:** Node service. Build `npm install`, start `npm start`. Set env vars above (or leave defaults; set `LLM_ENABLED=false` if no Ollama). Add a persistent disk for `queuestorm.db` if you want data to survive restarts (otherwise it recreates empty and re-seeds on demand).
- **EC2 / Poridhi Lab / VPS:** `node ≥18`, `npm install`, run under `pm2`/systemd behind nginx with HTTPS (Let's Encrypt). Ensure `/health` is reachable.
- **Docker:** see `backend/Dockerfile`.

> `GET /health` must respond over **HTTPS** within 10s, and `POST /sort-ticket` within 30s — both are sub-second here.

### Backend Dockerfile (already in repo)
```bash
cd backend
docker build -t queuestorm-api .
docker run -p 8787:8787 -e LLM_ENABLED=false queuestorm-api
```

---

## 4. Hosting the frontend

Static build — host anywhere (Vercel, Netlify, Render Static, S3+CloudFront, or the same box via nginx).
```bash
cd frontend
VITE_API_BASE_URL=https://your-api-host npm run build   # outputs frontend/dist
```
Serve `frontend/dist` as static files. It's an SPA — configure a catch-all rewrite to `/index.html`.

---

## 5. Optional: enable Gemma 4 (LLM augmentation)

Not required for grading. To turn it on:
```bash
# install Ollama (https://ollama.com), then:
ollama pull gemma4        # or set GEMMA_MODEL to an available small Gemma tag
ollama serve              # listens on 11434
# backend/.env: LLM_ENABLED=true, OLLAMA_HOST=http://localhost:11434
```
If Ollama is down or slow, the backend transparently falls back to the deterministic rules engine — responses stay valid and fast.

---

## 6. Submission checklist (Google Form)

- **Team name** — as registered.
- **GitHub repo URL** — this repo (public, with README + source + this runbook).
- **Live API base URL** — your backend `https://…` (verify `/health`).
- **Deployment platform** — whichever you chose above.
- **LLM used** — “Optional: Gemma 4 via Ollama (CPU); rules-based fallback. Works with LLM disabled.”
- **Known issues** — (optional) note if you deployed with `LLM_ENABLED=false`.
