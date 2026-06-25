// Agent 2 — Sentinel. Investigates flagged/critical cases and creates a review item.
import { scamPatternMatcher, riskScorer, slaMinutesFor } from '../tools/scam.js';
import { similarCases, upsertReview } from '../repo.js';

export function sentinelAgent({ ticket_id, message, case_type, severity }) {
  const { indicators } = scamPatternMatcher(message);
  const neighbors = similarCases(message, case_type, 5);
  const { risk_score, reasons } = riskScorer({ indicators, severity, neighbors });

  const slaMin = slaMinutesFor(severity);
  const sla_due = new Date(Date.now() + slaMin * 60_000).toISOString();

  upsertReview({
    ticket_id,
    risk_score,
    indicators: indicators.map((i) => i.key),
    reasons,
    sla_due,
  });

  return { ticket_id, risk_score, indicators, reasons, sla_due };
}
