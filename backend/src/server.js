// QueueStorm API server. Core: GET /health, POST /sort-ticket. Plus feature endpoints.
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import './db.js'; // ensures migration runs on boot
import { validateSortTicket } from './validate.js';
import { sortTicket } from './orchestrator.js';
import { isLlmReachable } from './llm/gemma.js';
import {
  getTicketDetail, listTickets, statsOverview, listReviews, setReviewStatus,
} from './repo.js';
import { copilotAgent } from './agents/copilot.js';
import { insightsAgent, getLatestInsight } from './agents/insights.js';

const app = express();
const startedAt = Date.now();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '256kb' }));

// --- Core: health -----------------------------------------------------------
app.get('/health', async (_req, res) => {
  let reachable = false;
  try { reachable = await isLlmReachable(); } catch { reachable = false; }
  res.json({
    status: 'ok',
    service: 'queuestorm',
    version: config.version,
    llm: { enabled: config.llm.enabled, reachable, model: config.llm.model },
    uptime_s: Math.round((Date.now() - startedAt) / 1000),
  });
});

// --- Core: classify one ticket ----------------------------------------------
app.post('/sort-ticket', async (req, res) => {
  const v = validateSortTicket(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error, detail: v.detail });
  try {
    const { response } = await sortTicket(v.value);
    res.json(response);
  } catch (err) {
    console.error('[sort-ticket] error:', err);
    res.status(500).json({ error: 'internal_error', detail: 'Classification failed.' });
  }
});

// --- Feature endpoints (Command Center / Sentinel / Insights / Copilot) ------
app.get('/tickets', (req, res) => {
  const { limit, offset, case_type, severity, department } = req.query;
  res.json({ tickets: listTickets({ limit, offset, case_type, severity, department }) });
});

app.get('/tickets/:id', (req, res) => {
  const detail = getTicketDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'not_found' });
  res.json(detail);
});

app.get('/stats', (_req, res) => {
  res.json(statsOverview());
});

app.get('/reviews', (_req, res) => {
  res.json({ reviews: listReviews() });
});

app.post('/reviews/:id/status', (req, res) => {
  const { status } = req.body || {};
  const allowed = ['open', 'claimed', 'escalated', 'safe'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'invalid_status' });
  const ok = setReviewStatus(req.params.id, status);
  res.json({ ok });
});

app.post('/tickets/:id/reply', async (req, res) => {
  const detail = getTicketDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'not_found' });
  const { ticket, classification } = detail;
  const result = await copilotAgent({
    ticket_id: ticket.ticket_id,
    message: ticket.message,
    case_type: classification?.case_type || 'other',
    locale: ticket.locale || 'en',
  });
  res.json(result);
});

app.get('/insights/summary', async (_req, res) => {
  let latest = getLatestInsight();
  // Recompute if none cached or older than 60s.
  if (!latest || Date.now() - new Date(latest.created_at + 'Z').getTime() > 60_000) {
    latest = await insightsAgent({ persist: true });
  }
  res.json(latest);
});

// 404
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

const server = app.listen(config.port, () => {
  console.log(`[queuestorm] API listening on http://localhost:${config.port}`);
  console.log(`[queuestorm] LLM ${config.llm.enabled ? 'enabled' : 'disabled'} (model=${config.llm.model})`);
});

export { app, server };
