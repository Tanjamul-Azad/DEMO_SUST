// Data-access layer. All SQLite access goes through here (parameterized queries only).
import { db } from './db.js';

const stmts = {
  upsertTicket: db.prepare(`
    INSERT INTO tickets (ticket_id, channel, locale, message, received_at)
    VALUES (@ticket_id, @channel, @locale, @message, datetime('now'))
    ON CONFLICT(ticket_id) DO UPDATE SET
      channel=excluded.channel, locale=excluded.locale, message=excluded.message
  `),
  insertClassification: db.prepare(`
    INSERT INTO classifications
      (ticket_id, case_type, severity, department, agent_summary,
       human_review_required, confidence, method, safety_passed, latency_ms)
    VALUES
      (@ticket_id, @case_type, @severity, @department, @agent_summary,
       @human_review_required, @confidence, @method, @safety_passed, @latency_ms)
  `),
  latestClassification: db.prepare(`
    SELECT * FROM classifications WHERE ticket_id = ? ORDER BY id DESC LIMIT 1
  `),
  getTicket: db.prepare(`SELECT * FROM tickets WHERE ticket_id = ?`),
  upsertReview: db.prepare(`
    INSERT INTO reviews (ticket_id, risk_score, indicators, reasons, status, sla_due)
    VALUES (@ticket_id, @risk_score, @indicators, @reasons, 'open', @sla_due)
    ON CONFLICT(ticket_id) DO UPDATE SET
      risk_score=excluded.risk_score, indicators=excluded.indicators,
      reasons=excluded.reasons, sla_due=excluded.sla_due
  `),
  updateReviewStatus: db.prepare(`UPDATE reviews SET status = ? WHERE ticket_id = ?`),
  insertReply: db.prepare(`
    INSERT INTO replies (ticket_id, locale, draft, policy_passed, method)
    VALUES (@ticket_id, @locale, @draft, @policy_passed, @method)
  `),
  insertInsight: db.prepare(`
    INSERT INTO insights (window, narrative, anomalies, stats)
    VALUES (@window, @narrative, @anomalies, @stats)
  `),
  latestInsight: db.prepare(`SELECT * FROM insights ORDER BY id DESC LIMIT 1`),
};

export function upsertTicket(t) {
  stmts.upsertTicket.run({
    ticket_id: t.ticket_id,
    channel: t.channel ?? null,
    locale: t.locale ?? null,
    message: t.message,
  });
}

export function insertClassification(c) {
  stmts.insertClassification.run({
    ticket_id: c.ticket_id,
    case_type: c.case_type,
    severity: c.severity,
    department: c.department,
    agent_summary: c.agent_summary,
    human_review_required: c.human_review_required ? 1 : 0,
    confidence: c.confidence,
    method: c.method,
    safety_passed: c.safety_passed ? 1 : 0,
    latency_ms: c.latency_ms ?? null,
  });
}

export function getTicketDetail(ticketId) {
  const ticket = stmts.getTicket.get(ticketId);
  if (!ticket) return null;
  const classification = stmts.latestClassification.get(ticketId);
  const review = db.prepare(`SELECT * FROM reviews WHERE ticket_id = ?`).get(ticketId);
  const replies = db.prepare(`SELECT * FROM replies WHERE ticket_id = ? ORDER BY id DESC`).all(ticketId);
  return { ticket, classification, review, replies };
}

export function listTickets({ limit = 50, offset = 0, case_type, severity, department } = {}) {
  const where = [];
  const params = {};
  if (case_type) { where.push('c.case_type = @case_type'); params.case_type = case_type; }
  if (severity) { where.push('c.severity = @severity'); params.severity = severity; }
  if (department) { where.push('c.department = @department'); params.department = department; }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.limit = Math.min(200, Number(limit) || 50);
  params.offset = Number(offset) || 0;
  const rows = db.prepare(`
    SELECT t.ticket_id, t.channel, t.locale, t.message, t.received_at,
           c.case_type, c.severity, c.department, c.agent_summary,
           c.human_review_required, c.confidence, c.created_at
    FROM tickets t
    JOIN classifications c ON c.id = (
      SELECT id FROM classifications WHERE ticket_id = t.ticket_id ORDER BY id DESC LIMIT 1
    )
    ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all(params);
  return rows.map((r) => ({ ...r, human_review_required: !!r.human_review_required }));
}

export function similarCases(message, caseType, k = 5) {
  // Lightweight similarity: same case_type, recent, sharing keywords.
  const rows = db.prepare(`
    SELECT t.ticket_id, t.message, c.case_type, c.severity
    FROM tickets t
    JOIN classifications c ON c.id = (
      SELECT id FROM classifications WHERE ticket_id = t.ticket_id ORDER BY id DESC LIMIT 1
    )
    WHERE c.case_type = ?
    ORDER BY c.created_at DESC LIMIT 50
  `).all(caseType);
  const words = new Set(String(message).toLowerCase().match(/[a-zঀ-৿]{3,}/g) || []);
  return rows
    .map((r) => {
      const rw = new Set(String(r.message).toLowerCase().match(/[a-zঀ-৿]{3,}/g) || []);
      let overlap = 0;
      for (const w of words) if (rw.has(w)) overlap++;
      return { ...r, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, k);
}

export function upsertReview(r) {
  stmts.upsertReview.run({
    ticket_id: r.ticket_id,
    risk_score: r.risk_score,
    indicators: JSON.stringify(r.indicators || []),
    reasons: JSON.stringify(r.reasons || []),
    sla_due: r.sla_due,
  });
}

export function listReviews() {
  const rows = db.prepare(`
    SELECT r.*, t.message, t.locale, c.case_type, c.severity, c.agent_summary
    FROM reviews r
    JOIN tickets t ON t.ticket_id = r.ticket_id
    JOIN classifications c ON c.id = (
      SELECT id FROM classifications WHERE ticket_id = r.ticket_id ORDER BY id DESC LIMIT 1
    )
    ORDER BY r.risk_score DESC, r.created_at DESC
  `).all();
  return rows.map((r) => ({
    ...r,
    indicators: JSON.parse(r.indicators || '[]'),
    reasons: JSON.parse(r.reasons || '[]'),
  }));
}

export function setReviewStatus(ticketId, status) {
  return stmts.updateReviewStatus.run(status, ticketId).changes > 0;
}

export function insertReply(r) {
  stmts.insertReply.run({
    ticket_id: r.ticket_id,
    locale: r.locale ?? null,
    draft: r.draft,
    policy_passed: r.policy_passed ? 1 : 0,
    method: r.method,
  });
}

export function statsOverview() {
  const total = db.prepare(`SELECT COUNT(*) n FROM classifications`).get().n;
  const bySeverity = db.prepare(`SELECT severity, COUNT(*) n FROM classifications GROUP BY severity`).all();
  const byCase = db.prepare(`SELECT case_type, COUNT(*) n FROM classifications GROUP BY case_type`).all();
  const byDept = db.prepare(`SELECT department, COUNT(*) n FROM classifications GROUP BY department`).all();
  const flagged = db.prepare(`SELECT COUNT(*) n FROM classifications WHERE human_review_required = 1`).get().n;
  const openReviews = db.prepare(`SELECT COUNT(*) n FROM reviews WHERE status = 'open'`).get().n;
  const latency = db.prepare(`SELECT AVG(latency_ms) avg, MAX(latency_ms) max FROM classifications WHERE latency_ms IS NOT NULL`).get();
  const recent = db.prepare(`
    SELECT created_at, severity FROM classifications ORDER BY id DESC LIMIT 60
  `).all();
  return { total, flagged, openReviews, bySeverity, byCase, byDept, latency, recent };
}

export function timeSeries(days = 7) {
  return db.prepare(`
    SELECT date(created_at) d, case_type, severity, COUNT(*) n
    FROM classifications
    WHERE created_at >= datetime('now', ?)
    GROUP BY d, case_type, severity
    ORDER BY d
  `).all(`-${Number(days)} days`);
}

export function insertInsight(i) {
  stmts.insertInsight.run({
    window: i.window,
    narrative: i.narrative,
    anomalies: JSON.stringify(i.anomalies || []),
    stats: JSON.stringify(i.stats || {}),
  });
}

export function latestInsight() {
  const row = stmts.latestInsight.get();
  if (!row) return null;
  return { ...row, anomalies: JSON.parse(row.anomalies || '[]'), stats: JSON.parse(row.stats || '{}') };
}
