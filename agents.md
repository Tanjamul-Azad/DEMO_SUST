# QueueStorm — Agentic AI Design (`agents.md`)

> **LLM:** **Gemma 4** (Google’s open Gemma family), served **locally via Ollama** on **CPU only**.
> This satisfies the task constraints: *GPU dependency not allowed*, *no secrets in the repo* (no hosted API key needed), and *LLM usage allowed but not required*.
> **Golden rule:** every agent is **LLM-optional**. A deterministic rules engine produces a valid answer on its own; Gemma 4 *augments* it. If Ollama is unreachable or slow, the agent degrades gracefully to rules and still returns valid JSON within the time budget (`/health` ≤ 10s, `/sort-ticket` ≤ 30s).

---

## 0. Why agents (not one prompt)

The product answers four questions, flags danger, drafts replies, and reports trends. Bundling that into one prompt is fragile and unsafe. Instead we run **four small, tool-using agents**, each with a single responsibility, a tight toolset, hard guardrails, and a rules fallback. They share one SQLite database and a common tool layer.

```
                ┌──────────────────────────────────────────────┐
  POST /sort-ticket ──▶ 1. TRIAGE AGENT ──▶ writes ticket+result │
                │            │ (flag?) ─▶ 2. SENTINEL AGENT       │
                │            └─────────▶ 3. COPILOT AGENT (reply) │
   cron / view  │                       4. INSIGHTS AGENT (trends)│
                └──────────────────────────────────────────────┘
                        shared SQLite  +  shared tool layer
```

| # | Agent | Responsibility | Fronts UI feature |
|---|-------|----------------|-------------------|
| 1 | **Triage Agent** | Classify a ticket; persist it | Playground (F1) |
| 2 | **Sentinel Agent** | Investigate flagged/critical cases; escalate | Sentinel (F3) |
| 3 | **Copilot Agent** | Draft a safe agent reply + next action | Ticket detail / Console |
| 4 | **Insights Agent** | Analyze the ticket store; narrate trends & anomalies | Insights (F4) |

---

## 1. Shared infrastructure

### 1.1 Model client (`gemma`)
- Runtime: **Ollama** (`OLLAMA_HOST`, default `http://localhost:11434`), model tag **`gemma4`** (or smallest available Gemma 4 variant that runs on CPU within budget; configurable via `GEMMA_MODEL` env).
- Calls are made with **JSON / structured output mode** (`format: "json"`) and a **per-call timeout** (`GEMMA_TIMEOUT_MS`, default 6000). On timeout/error → fallback to rules.
- Temperature low (≤ 0.2) for classification, slightly higher (≤ 0.5) for Copilot drafting.
- **No streaming to the customer**; agents return complete validated JSON only.

### 1.2 Tool layer (typed, pure-ish functions the agents call)
All tools live in `backend/tools/`, are individually unit-tested, and are the *only* way agents touch the DB or external logic. Each tool has a JSON schema for args + result. Tools are model-agnostic (rules engine and Gemma both call the same tools).

### 1.3 Shared SQLite schema (single source of truth)
```sql
CREATE TABLE tickets (
  ticket_id TEXT PRIMARY KEY,
  channel TEXT, locale TEXT, message TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE classifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(ticket_id),
  case_type TEXT NOT NULL, severity TEXT NOT NULL, department TEXT NOT NULL,
  agent_summary TEXT NOT NULL, human_review_required INTEGER NOT NULL,
  confidence REAL NOT NULL,
  method TEXT NOT NULL,          -- 'rules' | 'gemma' | 'hybrid'
  safety_passed INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE reviews (            -- Sentinel queue
  ticket_id TEXT PRIMARY KEY REFERENCES tickets(ticket_id),
  risk_score REAL, indicators TEXT, status TEXT DEFAULT 'open', -- open|claimed|escalated|safe
  sla_due TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE replies (           -- Copilot drafts
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL, locale TEXT, draft TEXT NOT NULL,
  policy_passed INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE insights (          -- Insights agent output
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  window TEXT, narrative TEXT, anomalies TEXT, created_at TEXT DEFAULT (datetime('now'))
);
```

### 1.4 The Safety Rule (non-negotiable, applies to every text any agent emits)
No agent output — `agent_summary`, Copilot reply, insight narrative — may **ask the customer to share PIN, OTP, password, or full card number**. Enforced by the `pii_safety_scanner` tool (§2 T3) on **every** generated string; on violation the text is rejected and a safe template is used instead. The grader checks this; treat it as a release blocker.

---

## 2. The tools (shared)

| ID | Tool | Args → Result | Used by |
|----|------|----------------|---------|
| T1 | `keyword_rules_classify` | `{message, channel, locale}` → `{case_type, severity, department, confidence, signals[]}` — deterministic lexicon + regex (bn/en/mixed) | 1 |
| T2 | `confidence_calibrator` | `{rules_result, gemma_result?}` → `{confidence}` — agreement & signal-strength based | 1 |
| T3 | `pii_safety_scanner` | `{text}` → `{passed, hits[]}` — flags any request for PIN/OTP/password/card | 1,2,3,4 |
| T4 | `summary_writer` | `{message, case_type, severity, locale}` → `{agent_summary}` — neutral 1–2 sentence summary (rules template or Gemma) | 1 |
| T5 | `db_write_classification` | `{ticket, classification}` → `{ok}` — persist ticket + result | 1 |
| T6 | `scam_pattern_matcher` | `{message}` → `{indicators[], score}` — OTP-ask, urgency, impersonation, link-bait, payout-bait | 2 |
| T7 | `similar_cases_lookup` | `{message, case_type, k}` → `{neighbors[]}` — SQLite query of prior tickets (keyword/recency; optional embedding) | 2,3 |
| T8 | `risk_scorer` | `{indicators, severity, neighbors}` → `{risk_score, reasons[]}` | 2 |
| T9 | `escalation_writer` | `{ticket_id, risk_score, indicators, sla_minutes}` → `{ok}` — upsert into `reviews` | 2 |
| T10 | `template_retriever` | `{case_type, locale}` → `{template}` — approved, PIN/OTP-safe reply skeletons | 3 |
| T11 | `tone_localizer` | `{text, locale}` → `{text}` — render en/bn/mixed, polite register | 3 |
| T12 | `db_aggregate` | `{window, group_by}` → `{rows[]}` — counts/medians/trends over `classifications` | 4 |
| T13 | `trend_detector` | `{series}` → `{trends[]}` | 4 |
| T14 | `anomaly_flagger` | `{series, baseline}` → `{anomalies[]}` — z-score / spike detection (e.g. phishing surge) | 4 |
| T15 | `report_writer` | `{stats, anomalies}` → `{narrative}` — Gemma-written or template prose (then T3-checked) | 4 |

> Every tool is also reachable by the rules-only path, so the system is fully functional with Ollama stopped.

---

## 3. Agent 1 — **Triage Agent** (core, runs on every `POST /sort-ticket`)

- **Goal:** Return the exact response schema (`case_type, severity, department, agent_summary, human_review_required, confidence`) for one ticket, safely, within 30s.
- **Tools:** T1 → T4 → (T3 on summary) → T2 → T5. Gemma 4 is consulted in parallel with T1 when available.
- **Policy / loop:**
  1. Run **T1 (rules)** → baseline result + `signals`.
  2. If Gemma available & within budget, ask Gemma 4 (JSON mode) to classify, constrained to the enums; else skip.
  3. **Reconcile:** rules and Gemma agree → high confidence; disagree → prefer the safety-conservative label (anything matching phishing/critical signals wins toward escalation), method=`hybrid`. Compute final via **T2**.
  4. **T4** writes the neutral `agent_summary`; run **T3** on it — if it fails, regenerate from a safe template.
  5. Set `human_review_required = (severity === 'critical') || (case_type === 'phishing_or_social_engineering')`.
  6. **T5** persists `tickets` + `classifications`. If flagged, hand off to the **Sentinel Agent** (write the `reviews` row / enqueue).
- **Guardrails:** output validated against `zod`/JSON-schema; enums enforced; confidence clamped [0,1]; `ticket_id` echoed exactly; total wall-clock guarded with a hard fallback to pure-rules result.
- **Maps to:** the 5 public sample cases must classify correctly (`wrong_transfer/high`, `payment_failed/high`, `phishing/critical`, `refund/low`, `other/low`).

---

## 4. Agent 2 — **Sentinel Agent** (fraud / phishing investigator)

- **Goal:** For any flagged ticket, gather scam signals, score risk, and create a human-review item with an SLA.
- **Trigger:** Triage handoff when `human_review_required` or `case_type = phishing_or_social_engineering`.
- **Tools:** T6 (pattern match) → T7 (similar past cases) → T8 (risk score) → T9 (escalation). Gemma 4 optionally **explains** the indicators in plain language (T3-checked) for the reviewer.
- **Policy / loop:** detect indicators → pull `k` similar historical tickets → compute `risk_score` & reasons → set SLA (critical = 5 min, high = 30 min) → upsert `reviews`. If Gemma is up, generate a short reviewer-facing rationale; never customer-facing here.
- **Guardrails:** read-mostly; only writes `reviews`; rationale passes T3; cannot downgrade a critical below human review.
- **Maps to:** the **Sentinel** page radar + review queue (risk → radius, severity → color, SLA timer).

---

## 5. Agent 3 — **Copilot Agent** (safe reply composer)

- **Goal:** Draft a reply a human agent can send, correct for the case type, in the customer’s language, **never** asking for PIN/OTP/password/card.
- **Trigger:** on-demand from Ticket Detail / Console (“Draft reply”).
- **Tools:** T10 (approved template by case_type) → (T7 for context) → Gemma 4 fills/personalizes → T11 (localize en/bn/mixed) → **T3 (hard gate)** → persist to `replies`.
- **Policy / loop:** start from an approved, safety-clean template so even a no-LLM path is valid; Gemma personalizes within the template’s safe slots; **T3 must pass** or the raw template is sent instead and the violation logged.
- **Guardrails:** template-first (LLM can only fill safe slots), T3 as a release-blocking gate, tone constrained to polite/neutral, no promises of funds/timelines beyond policy, no requests for secrets.
- **Maps to:** “Copilot suggested reply” block on Ticket Detail.

---

## 6. Agent 4 — **Insights Agent** (analytics narrator)

- **Goal:** Turn the stored ticket history into trends, anomalies, and a short readable narrative for the Insights page.
- **Trigger:** periodic (cron / on dashboard load, cached) — **not** on the request hot path, so it never affects `/sort-ticket` latency.
- **Tools:** T12 (aggregate) → T13 (trends) → T14 (anomalies, e.g. phishing surge / latency spike / department overload) → T15 (narrative) → T3 → persist to `insights`.
- **Policy / loop:** compute windows (24h / 7d) → detect trends & anomalies → Gemma writes a 2–4 sentence narrative grounded **only** in the computed numbers (no fabrication) → T3-check → store.
- **Guardrails:** narrative must cite real aggregates (pass the numbers in, forbid invented figures); T3-checked; cached with TTL.
- **Maps to:** the **Insights** page charts + the prose anomaly callouts.

---

## 7. Orchestration, config & fallback

- **Orchestrator** (`backend/orchestrator.ts`): on `POST /sort-ticket` runs Triage synchronously, then fires Sentinel (if flagged) and leaves Copilot/Insights for later/async — keeps the request fast.
- **Env:** `OLLAMA_HOST`, `GEMMA_MODEL=gemma4`, `GEMMA_TIMEOUT_MS=6000`, `LLM_ENABLED=true|false`, `DATABASE_URL=./queuestorm.db`. **No secrets** — Ollama is local; nothing goes in the repo.
- **Graceful degradation matrix:**
  | Condition | Behavior |
  |-----------|----------|
  | Ollama down / `LLM_ENABLED=false` | pure rules; `method='rules'`; still valid + fast |
  | Gemma timeout | use rules result already computed; log it |
  | Gemma disagrees with rules | safety-conservative label wins; `method='hybrid'` |
  | T3 safety fail on any text | reject text, substitute safe template, log violation |
- **Observability:** every classification stores `method` and `safety_passed`; the UI status dot reflects `GET /health` (which also reports whether Gemma is reachable, without leaking secrets).

---

## 8. Definition of done (agents)

- [ ] Four agents implemented with the shared tool layer + SQLite schema (§1.3).
- [ ] System returns valid responses **with Ollama stopped** (rules-only path) within budget.
- [ ] `pii_safety_scanner` (T3) gates **every** generated string; the 4 unsafe-summary style cases are rejected.
- [ ] 5 public sample cases classify correctly.
- [ ] Sentinel writes review items with SLA; Copilot drafts are template-first + T3-passed; Insights narratives cite only real aggregates.
- [ ] No secrets in repo; GPU not required; Gemma 4 runs on CPU via Ollama.
