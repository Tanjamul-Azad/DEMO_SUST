# QueueStorm — Schema, Safety & Hackathon Compliance

This document locks down the **data schema**, the **safety model**, and a line-by-line **mapping to the hackathon criteria** so nothing in the grading rubric is missed.

---

## 1. Compliance matrix (every requirement → where it’s satisfied)

| Spec requirement | Required? | How QueueStorm satisfies it |
|------------------|-----------|------------------------------|
| `GET /health` returns a simple health response | Yes | `GET /health` → `{status:"ok", ...}`; responds in ms (well under 10s). |
| `POST /sort-ticket` accepts a ticket, returns classification | Yes | Implemented; returns the exact response schema. |
| Response within 30s | Yes | Rules path is sub-millisecond; Gemma call is timeout-bounded (`GEMMA_TIMEOUT_MS=6000`) with rules fallback, so worst case ≪ 30s. |
| `/health` within 10s | Yes | No I/O on the hot path; returns instantly. |
| Request schema (`ticket_id, channel, locale, message`) | Yes | Validated; `ticket_id` + `message` required, `channel`/`locale` optional. |
| Response schema (7 fields) | Yes | `ticket_id, case_type, severity, department, agent_summary, human_review_required, confidence`. |
| `ticket_id` echoed back exactly | Yes | Copied verbatim from request to response. |
| `case_type` enum (5 values) | Yes | Constrained to the 5 enum values; never emits anything else. |
| `severity` enum (low/medium/high/critical) | Yes | Constrained; defaults conservatively. |
| `department` enum (4 values) | Yes | Derived from `case_type` per the spec mapping (§3). |
| `agent_summary` = 1–2 neutral sentences | Yes | Generated 1–2 sentence neutral summary; length-bounded. |
| `human_review_required` boolean | Yes | `true` iff `severity==critical` **or** `case_type==phishing_or_social_engineering`. |
| `confidence` float in [0,1] | Yes | Clamped to [0,1]. |
| **Safety rule:** summary must never ask for PIN/OTP/password/full card | Yes | `pii_safety_scanner` gates **every** generated string; violations are rejected & replaced with a safe template (§4). |
| Public HTTPS endpoint | Yes | Deployed over HTTPS (Render/Railway/Fly/etc.); local dev over HTTP. |
| GPU dependency not allowed | Yes | Rules engine is pure CPU; Gemma (optional) runs on CPU via Ollama. |
| Secrets in repository not allowed | Yes | No secrets committed; only env vars (Ollama is local, needs no key). `.env` is git-ignored; `.env.example` documents vars. |
| LLM usage allowed but not required | Yes | LLM is **optional** (`LLM_ENABLED`); rules-only path is fully valid. |
| README + source in public repo | Yes | `README.md` + full source. |
| Deployment runbook for local replication | Yes | Runbook in `README.md` + `DEPLOY.md`. |
| 5 public sample cases classify correctly | Yes | Covered by the rules engine + tests (§5). |

---

## 2. API schema (authoritative)

### `GET /health`
```json
{ "status": "ok", "service": "queuestorm", "version": "1.0.0",
  "llm": { "enabled": true, "reachable": false, "model": "gemma4" },
  "uptime_s": 1234 }
```
- `llm.reachable` reflects Ollama availability **without leaking any secret**. Always returns `ok` as long as the rules engine is up (the service does not depend on the LLM).

### `POST /sort-ticket`
**Request (validated)**
```jsonc
{
  "ticket_id": "T-001",          // string, REQUIRED, echoed back
  "channel":   "app",            // string, optional ∈ {app, sms, call_center, merchant_portal}
  "locale":    "en",             // string, optional ∈ {bn, en, mixed}
  "message":   "..."             // string, REQUIRED, free text
}
```
Validation rules:
- Missing/empty `ticket_id` or `message` → `400` with `{error, detail}`.
- Unknown `channel`/`locale` → accepted but normalized to `null`/best-effort (we never reject on optional fields).
- `message` length capped (e.g. 8 KB) to bound processing.

**Response (exact)**
```jsonc
{
  "ticket_id": "T-001",                                  // == request
  "case_type": "wrong_transfer",                         // enum (5)
  "severity": "high",                                    // enum (4)
  "department": "dispute_resolution",                    // enum (4)
  "agent_summary": "Customer reports sending 5000 BDT…", // 1–2 neutral sentences, safety-checked
  "human_review_required": true,                         // critical OR phishing
  "confidence": 0.85                                     // float [0,1]
}
```

> **Note on `human_review_required`.** The spec's field definition and prose both state the flag is set **“for critical severity or phishing cases.”** We follow that normative rule: `true` iff `severity === "critical"` **or** `case_type === "phishing_or_social_engineering"`. The illustrative example in spec §3 shows `true` for a `wrong_transfer / high` case, which is inconsistent with that rule; since the §7 grading sample table does not assert this field and the rule is stated twice, we implement the documented rule (a `high` wrong-transfer returns `false`). This is intentional and auditable.

### Supporting endpoints (power the F2/F3/F4 features; not graded, but wired)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/tickets?limit&offset&case_type&severity&department` | Command Center live table |
| GET | `/tickets/:id` | Ticket detail |
| GET | `/stats` | Command Center stat tiles (throughput, severity mix, dept load, latency) |
| GET | `/reviews` | Sentinel human-review queue (flagged cases + risk + SLA) |
| POST | `/tickets/:id/reply` | Copilot safe-reply draft (template-first + safety-gated) |
| GET | `/insights/summary` | Insights trends + anomalies + narrative |

All write nothing that bypasses the safety scanner. None are on the `/sort-ticket` hot path except the classification persist.

---

## 3. Enum logic (deterministic, matches the spec tables)

**case_type → department** (spec §4.2)
```
wrong_transfer                  → dispute_resolution
payment_failed                  → payments_ops
phishing_or_social_engineering  → fraud_risk
refund_request                  → dispute_resolution if contested/disputed, else customer_support
other                           → customer_support
```

**severity defaults by case_type** (then adjusted by signals)
```
phishing_or_social_engineering  → critical            (always human_review_required)
wrong_transfer                  → high                 (money already moved)
payment_failed                  → high                 (balance possibly deducted)
refund_request                  → low  (→ medium if large amount / repeated / disputed)
other                           → low  (→ medium/high on outage/security keywords)
```
Severity can be escalated by signals (large amount, “urgent”, “fraud”, “hacked”, account-takeover language) but **never silently downgraded** below what safety signals imply.

**human_review_required**
```
= (severity === "critical") || (case_type === "phishing_or_social_engineering")
```

---

## 4. Safety model (the release-blocking rule)

The grader fails any response whose `agent_summary` asks the customer to share **PIN, OTP, password, or full card number**. We enforce this in depth:

1. **Never generate such text by construction.** Summary templates and Copilot templates contain no requests for secrets.
2. **`pii_safety_scanner` (T3)** runs on *every* generated string (`agent_summary`, Copilot replies, Insights narratives). It flags:
   - requests to *share/send/give/tell/provide* a `PIN | OTP | one-time password | password | passcode | CVV | full card number | card details`,
   - in **English and Bangla** (e.g. `পিন`, `ওটিপি`, `পাসওয়ার্ড`) and code-mixed phrasing.
   - It distinguishes **describing** a phishing attempt (“customer was asked for their OTP” — safe, neutral) from **asking** the customer for it (“please share your OTP” — blocked). Detection keys on imperative/second-person request patterns, not mere mention.
3. **On violation:** the offending text is discarded and replaced with a known-safe template; the event is logged (`safety_passed=0` in `classifications`) for audit. The customer never sees an unsafe string.
4. **Outbound trust posture:** the UI carries a “We will never ask for your PIN/OTP/password” mark; Copilot replies, when relevant, actively *warn* the customer never to share those — the opposite of asking.

**Other safety/robustness measures**
- Input is treated as untrusted text; no `eval`, no string→SQL interpolation (parameterized queries only).
- No PII beyond the message is stored; messages can be truncated/redacted in logs.
- Rate-friendly, stateless classification (DB writes are append-only and non-blocking to the response).
- Deterministic fallback guarantees a valid, safe response even if the LLM misbehaves or is offline.

---

## 5. Test plan (correctness + safety)

**Golden cases (must pass — spec §7)**

| Message | Expected case_type | Expected severity |
|---------|--------------------|-------------------|
| I sent 3000 to wrong number | `wrong_transfer` | high |
| Payment failed but balance deducted | `payment_failed` | high |
| Someone called asking my OTP, is that bKash? | `phishing_or_social_engineering` | critical |
| Please refund my last transaction, I changed my mind | `refund_request` | low |
| App crashed when I opened it | `other` | low |

**Schema tests:** every response validates against the JSON schema; `ticket_id` echoed; enums respected; `confidence ∈ [0,1]`; `human_review_required` correct for the phishing/critical case.

**Safety tests:** assert no response contains an *imperative request* for PIN/OTP/password/card; include adversarial inputs that try to make the model echo such a request; include a Bangla phishing case.

**Latency tests:** `/health` < 100 ms; `/sort-ticket` rules-only < 50 ms; with Gemma, bounded by timeout.

**Fallback test:** with `LLM_ENABLED=false` (and with Ollama stopped), all golden cases still pass.

These are implemented under `backend/test/`.
