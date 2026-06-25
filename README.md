# QueueStorm

**Intelligent ticket triage for digital finance.**
*We read the storm. You read one sentence.*

QueueStorm reads one customer support message and instantly answers four questions — **what kind of problem**, **how serious**, **which team**, and **a one-sentence summary** — then raises a flag for phishing or critical cases so a human reviews them immediately. It never asks a customer for their PIN, OTP, password, or card number.

Built for the **bKash · SUST CSE Carnival 2026 — Codex Community Hackathon (QueueStorm Mock Preliminary)**.

---

## Table of contents
- [What it does](#what-it-does)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [API](#api)
- [The four AI agents](#the-four-ai-agents)
- [Project status](#project-status)
- [Local development](#local-development)
- [Deployment runbook](#deployment-runbook)
- [Safety & constraints](#safety--constraints)
- [Repository layout](#repository-layout)

---

## What it does

Given one CRM ticket:
```json
{ "ticket_id": "T-001", "channel": "app", "locale": "en",
  "message": "I sent 5000 taka to a wrong number this morning, please help me get it back" }
```
QueueStorm returns:
```json
{ "ticket_id": "T-001", "case_type": "wrong_transfer", "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports sending 5000 BDT to a wrong number and requests recovery.",
  "human_review_required": false, "confidence": 0.85 }
```

**Enums**
- `case_type`: `wrong_transfer · payment_failed · refund_request · phishing_or_social_engineering · other`
- `severity`: `low · medium · high · critical`
- `department`: `customer_support · dispute_resolution · payments_ops · fraud_risk`

---

## Features

**Core (required)**
- `GET /health` — service health
- `POST /sort-ticket` — classify one ticket into the schema above

**New features (added on top of the core task)**

| # | Feature | What it adds |
|---|---------|--------------|
| **F1** | **Triage Playground** | Type or paste a customer message and watch it get classified live, with a cinematic reveal of the case type, severity gauge, routed department, summary, escalation flag, confidence, and raw JSON. Includes Bangla / mixed-locale samples. |
| **F2** | **Command Center** | A live operations dashboard — real-time ticket flow visualization, severity heatmap, department load balancing, throughput and latency, with `critical`/`phishing` rows escalating to Sentinel in real time. |
| **F3** | **Sentinel** | A fraud & phishing radar. Every `human_review_required` case surfaces here on a 3D radar (risk → distance, severity → color) with a review queue, SLA timers, and detected threat-pattern indicators. |
| **F4** | **Insights** | Historical analytics from the ticket store — volume trends, case-type mix, severity over time, department workload, resolution funnel, and plain-language anomaly callouts (e.g. a phishing surge). |

The four features map 1:1 to the four AI agents (see [agents](#the-four-ai-agents)).

---

## Architecture

```
                         ┌───────────────────────────────────────────────┐
  Customer message  ───▶ │  Backend API (Node/Express or FastAPI)         │
   POST /sort-ticket     │   1. Triage Agent  → classify + persist        │
                         │      └ flagged ─▶ 2. Sentinel Agent (escalate) │
                         │   3. Copilot Agent  → safe reply draft          │
                         │   4. Insights Agent → trends (async/cron)       │
                         │            shared tool layer + SQLite           │
                         └───────────────────────────────────────────────┘
                                          ▲
   Frontend (React + Vite, Three.js, GSAP, Lenis) ── Playground · Console · Sentinel · Insights
```

- **LLM:** Gemma 4 via **Ollama**, **CPU only**, and **fully optional** — a deterministic rules engine produces valid answers on its own, so the service works (and stays within the latency budget) even with the LLM disabled.
- **Storage:** SQLite — every classification is persisted, which powers the Command Center, Sentinel, and Insights.

---

## Tech stack

**Frontend** — React · Vite · Tailwind CSS · Three.js (React Three Fiber + drei + postprocessing) · GSAP (ScrollTrigger / SplitText) · Lenis (smooth scroll) · Framer Motion · TanStack Query · Zustand · d3 (hand-built charts). Two complete themes — **Obsidian** (dark) and **Porcelain** (light) — with scripted scroll choreography, parallax, and signature 3D scenes. Full mobile support and a `prefers-reduced-motion` fallback. See **[`design instructions.md`](./design%20instructions.md)** for the complete design spec.

**Backend** — Node/Express (or FastAPI) · SQLite · a typed tool layer · Ollama (Gemma 4) with a rules-based fallback. See **[`agents.md`](./agents.md)** for the agent + tool design.

---

## API

### `GET /health`
Returns service health (and whether Gemma is reachable, without leaking secrets). Responds within 10s.

### `POST /sort-ticket`
**Request**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `ticket_id` | string | yes | echoed back |
| `channel` | string | no | `app · sms · call_center · merchant_portal` |
| `locale` | string | no | `bn · en · mixed` |
| `message` | string | yes | free-text complaint |

**Response** — `ticket_id, case_type, severity, department, agent_summary, human_review_required, confidence`. Responds within 30s. `human_review_required` is `true` for `critical` severity or phishing cases.

**Public sample cases**

| # | Message | case_type | severity |
|---|---------|-----------|----------|
| 1 | I sent 3000 to wrong number | `wrong_transfer` | high |
| 2 | Payment failed but balance deducted | `payment_failed` | high |
| 3 | Someone called asking my OTP, is that bKash? | `phishing_or_social_engineering` | critical |
| 4 | Please refund my last transaction, I changed my mind | `refund_request` | low |
| 5 | App crashed when I opened it | `other` | low |

---

## The four AI agents

Each agent has a single responsibility, a tight toolset, hard guardrails, and a rules-only fallback. Full design in **[`agents.md`](./agents.md)**.

1. **Triage Agent** — classifies each ticket and persists it (fronts the Playground).
2. **Sentinel Agent** — investigates flagged/critical cases, scores risk, and creates SLA-timed human-review items (fronts Sentinel).
3. **Copilot Agent** — drafts a safe, policy-compliant reply in the customer’s language, never asking for PIN/OTP/password/card (fronts Ticket Detail).
4. **Insights Agent** — analyzes the ticket store and narrates trends/anomalies grounded only in real aggregates (fronts Insights).

A shared `pii_safety_scanner` tool gates **every** generated string against the safety rule.

---

## Project status

- [x] Product spec captured (this README)
- [x] Frontend design spec — [`design instructions.md`](./design%20instructions.md)
- [x] Agent design — [`agents.md`](./agents.md)
- [x] Schema + safety + compliance — [`SCHEMA_AND_SAFETY.md`](./SCHEMA_AND_SAFETY.md)
- [x] Backend implementation — API + SQLite + 4 agents (rules-first, LLM-optional); 42 tests passing
- [x] Frontend implementation — all pages, both themes, Three.js hero + GSAP/Lenis scroll; production build passing

---

## Local development

Requires Node ≥ 18 (tested on 22). No GPU, no secrets. See **[`DEPLOY.md`](./DEPLOY.md)** for the full runbook.

**One command (Python helper)** — installs deps, migrates, seeds, and runs both servers:
```bash
python run.py            # http://localhost:5173 (UI) + http://localhost:8787 (API)
# options: --build (serve prod build) · --llm · --reset · --no-seed · --no-open
```

**Or run each service manually:**
```bash
# Backend  (terminal 1)  ->  http://localhost:8787
cd backend
cp .env.example .env        # defaults are fine; set LLM_ENABLED=false to skip the LLM
npm install
npm run migrate             # create SQLite schema (also auto-runs on boot)
npm run seed                # optional: sample tickets for the dashboards
npm test                    # golden cases + safety + schema (42 assertions)
npm start                   # serves /health and /sort-ticket

# Frontend  (terminal 2)  ->  http://localhost:5173
cd ../frontend
cp .env.example .env        # VITE_API_BASE_URL=http://localhost:8787
npm install
npm run dev
```

---

## Deployment runbook

*Required by the task: the repo must let a grader deploy locally if no live URL is provided.* Full step-by-step instructions, env vars, Docker, and hosting notes are in **[`DEPLOY.md`](./DEPLOY.md)**. Quick outline:
1. **Prerequisites:** Node 20+, SQLite, optionally Ollama with `gemma4` pulled (the service runs fine without it via the rules fallback).
2. **Configure:** copy `.env.example` → `.env`. No secrets are required (Ollama is local). Set `LLM_ENABLED=false` to run pure-rules.
3. **Initialize DB:** run the migration to create `queuestorm.db`.
4. **Run:** start the backend; verify `GET /health` returns OK within 10s and `POST /sort-ticket` returns the schema within 30s.
5. **Frontend:** point `VITE_API_BASE_URL` at the backend, `npm run build`, serve `dist/`.
6. **Hosting:** any of Render / Railway / Fly / Vercel / EC2 / Poridhi Lab over **HTTPS**; ensure `/health` responds.

---

## Safety & constraints

- **Safety rule:** no response (summary, reply, or narrative) ever asks the customer to share **PIN, OTP, password, or full card number**. Enforced by the `pii_safety_scanner` on every generated string.
- **No GPU** dependency. **No secrets** in the repository (use environment variables; Ollama runs locally).
- LLM is **optional** — the service is fully functional, valid, and within time budgets using rules alone.
- Localized for **bn / en / mixed** (Bangladesh), currency in **BDT (৳)**, times in **Asia/Dhaka**.

---

## Repository layout

```
.
├── README.md                 # this file
├── design instructions.md    # complete frontend redesign spec (Obsidian Aurora)
├── agents.md                 # four-agent + tool design (Gemma 4 via Ollama)
├── SCHEMA_AND_SAFETY.md      # data schema, safety model, hackathon compliance matrix
├── DEPLOY.md                 # deployment runbook (local + hosted)
├── frontend/                 # React + Vite + Three.js + GSAP + Lenis app
│   └── src/{pages,components,three,lib,store,styles}
└── backend/                  # Express + SQLite API + rules engine + 4 agents
    └── src/{agents,tools,llm,...}  test/
```
