// Agent 4 — Insights. Analyzes the ticket store; narrates trends + anomalies (grounded only in real numbers).
import { statsOverview, timeSeries, insertInsight, latestInsight } from '../repo.js';
import { generateTextWithGemma } from '../llm/gemma.js';
import { piiSafetyScan } from '../tools/safety.js';

// T13/T14 — trend + anomaly detection over the daily series.
function detectAnomalies(series) {
  const byDay = {};
  for (const r of series) {
    byDay[r.d] = byDay[r.d] || { total: 0, phishing: 0, critical: 0 };
    byDay[r.d].total += r.n;
    if (r.case_type === 'phishing_or_social_engineering') byDay[r.d].phishing += r.n;
    if (r.severity === 'critical') byDay[r.d].critical += r.n;
  }
  const days = Object.keys(byDay).sort();
  const anomalies = [];
  const totals = days.map((d) => byDay[d].total);
  const mean = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
  const last = days[days.length - 1];
  if (last && byDay[last].total > mean * 1.6 && byDay[last].total >= 5) {
    anomalies.push({ type: 'volume_spike', day: last, detail: `Volume ${byDay[last].total} vs avg ${mean.toFixed(1)}` });
  }
  if (last && byDay[last].phishing >= 3) {
    anomalies.push({ type: 'phishing_surge', day: last, detail: `${byDay[last].phishing} phishing/social-engineering reports` });
  }
  if (last && byDay[last].critical >= 3) {
    anomalies.push({ type: 'critical_load', day: last, detail: `${byDay[last].critical} critical cases` });
  }
  return anomalies;
}

export async function insightsAgent({ window = '7d', persist = true } = {}) {
  const stats = statsOverview();
  const series = timeSeries(7);
  const anomalies = detectAnomalies(series);

  const topCase = [...stats.byCase].sort((a, b) => b.n - a.n)[0];
  const facts =
    `total=${stats.total}, flagged=${stats.flagged}, openReviews=${stats.openReviews}, ` +
    `topCase=${topCase ? `${topCase.case_type}(${topCase.n})` : 'n/a'}, ` +
    `severity=${stats.bySeverity.map((s) => `${s.severity}:${s.n}`).join(' ')}`;

  // Template narrative (always available, grounded in the numbers).
  let narrative =
    `Across ${stats.total} classified tickets, ${stats.flagged} were flagged for human review ` +
    `(${stats.openReviews} still open). ` +
    (topCase ? `The most common case type is ${topCase.case_type.replace(/_/g, ' ')}. ` : '') +
    (anomalies.length ? `Notable: ${anomalies.map((a) => a.detail).join('; ')}.` : 'No anomalies detected in the last 7 days.');

  // Optional Gemma rewrite, constrained to the same facts (no invented figures).
  const gen = await generateTextWithGemma(
    `Write 2-3 sentences summarizing these support-ticket metrics for an operations dashboard. ` +
      `Use ONLY these numbers, invent nothing. Metrics: ${facts}. ` +
      `Anomalies: ${anomalies.map((a) => a.detail).join('; ') || 'none'}.`,
    { temperature: 0.3 },
  ).catch(() => null);
  if (gen && piiSafetyScan(gen).passed) narrative = gen;

  const out = { window, narrative, anomalies, stats };
  if (persist) insertInsight(out);
  return out;
}

export function getLatestInsight() {
  return latestInsight();
}
