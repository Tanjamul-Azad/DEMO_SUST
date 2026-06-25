// T6 scam_pattern_matcher + T8 risk_scorer — fraud signals for the Sentinel agent.

const INDICATORS = [
  ['otp_request', /\b(otp|one[\s-]?time|pin|pass\s?word|passcode|cvv)\b/i, 'Request for OTP/PIN/password'],
  ['urgency', /\b(urgent|immediately|right\s?now|asap|expire|within\s?\d+\s?(min|hour)|act\s?now|last\s?warning)\b/i, 'Urgency pressure'],
  ['impersonation', /\b(bkash|nagad|bank|agent|officer|customer\s?care|helpline)\b[^.?!]{0,20}\b(call|calling|called|representative|official)\b|claim(ing)?\s?to\s?be/i, 'Impersonation of an official'],
  ['link_bait', /\b(click|open|visit|tap)\b[^.?!]{0,15}\b(link|url|http|bit\.ly|www\.)\b|https?:\/\//i, 'Suspicious link'],
  ['payout_bait', /\b(won|win|prize|lottery|reward|bonus|gift|cashback|refund\s?bonus)\b/i, 'Too-good-to-be-true reward'],
  ['account_threat', /\b(block(ed)?|suspend(ed)?|deactivat|close(d)?|locked)\b[^.?!]{0,15}\b(account|number|sim|wallet)\b/i, 'Account-block threat'],
  ['bn_scam', /প্রতারক|প্রতারণা|জালিয়াতি|সন্দেহজনক|লটারি|পুরস্কার|ওটিপি|পিন/u, 'Bangla scam signal'],
];

export function scamPatternMatcher(message = '') {
  const text = String(message || '');
  const indicators = [];
  for (const [key, re, label] of INDICATORS) {
    if (re.test(text)) indicators.push({ key, label });
  }
  // Raw signal score 0..1
  const score = Math.min(1, indicators.length / 4);
  return { indicators, score };
}

// T8 risk_scorer — combine pattern score + severity + neighbour history.
export function riskScorer({ indicators = [], severity = 'low', neighbors = [] }) {
  const sevWeight = { low: 0.1, medium: 0.35, high: 0.6, critical: 0.9 }[severity] ?? 0.3;
  const patternWeight = Math.min(1, indicators.length / 3);
  const historyWeight = Math.min(1, neighbors.length / 5) * 0.3;
  const risk = Math.max(0, Math.min(1, 0.5 * sevWeight + 0.4 * patternWeight + historyWeight));
  const reasons = [];
  if (severity === 'critical') reasons.push('Critical severity');
  for (const i of indicators) reasons.push(i.label);
  if (neighbors.length) reasons.push(`${neighbors.length} similar prior case(s)`);
  return { risk_score: Math.round(risk * 100) / 100, reasons };
}

// SLA minutes by severity (Sentinel queue).
export function slaMinutesFor(severity) {
  return { critical: 5, high: 30, medium: 120, low: 480 }[severity] ?? 120;
}
