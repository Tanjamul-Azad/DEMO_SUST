// T1 keyword_rules_classify — deterministic, CPU-only classifier (en/bn/mixed).
// Produces a valid classification on its own; the LLM only augments this.
import { departmentFor, SEVERITY_RANK as RANK, SEVERITIES as NAME } from '../enums.js';

// --- Signal lexicons. Weighted regexes per case type. Bangla + English + Banglish. ---
const SIGNALS = {
  phishing_or_social_engineering: [
    [/\b(otp|o\.t\.p|one[\s-]?time\s?(password|pin|code))\b/i, 3],
    [/\b(pin|p\.i\.n)\b/i, 2],
    [/\bpass\s?word|passcode|cvv|card\s?(number|details|pin)\b/i, 2],
    [/\b(share|tell|give|provide|send|verify|confirm)\b[^.?!]{0,30}\b(otp|pin|password|code|account)\b/i, 3],
    [/\b(someone|somebody|a\s?person|unknown\s?(number|caller))\b[^.?!]{0,30}\b(call|called|calling|text|sms|messag)/i, 2],
    [/\b(scam|scammer|fraud|fraudster|phish|phishing|impersonat|fake\s?(call|sms|agent|bkash))\b/i, 3],
    [/\b(is\s?(this|that)\s?(really\s?)?bkash|claim(ing)?\s?to\s?be\s?bkash|pretend)/i, 2],
    [/\b(won|win|prize|lottery|reward|bonus|gift)\b[^.?!]{0,30}\b(claim|collect|verify|otp|pin|link)/i, 2],
    [/\b(click|open)\b[^.?!]{0,20}\b(link|url)\b/i, 1],
    [/\b(verify|update|unblock|reactivate)\b[^.?!]{0,20}\b(account|number|sim)\b/i, 1],
    [/ওটিপি|পিন|পাসওয়ার্ড|প্রতারক|প্রতারণা|ফাঁদ|জালিয়াতি|সন্দেহজনক/u, 3],
  ],
  wrong_transfer: [
    [/\bwrong\s?(number|recipient|account|person|nagad|bkash|merchant)\b/i, 3],
    [/\b(sent|send|transfer(red)?|paid)\b[^.?!]{0,30}\bwrong\b/i, 3],
    [/\b(mistakenly|accidentally|by\s?mistake|wrongly)\b[^.?!]{0,30}\b(sent|send|transfer|paid)\b/i, 3],
    [/\bsent\b[^.?!]{0,20}\bto\s?(the\s?)?wrong\b/i, 3],
    [/ভুল\s?(নাম্বার|নম্বর|নাম্বারে|নম্বরে|একাউন্ট|অ্যাকাউন্ট)|ভুল\s?করে\s?(পাঠ|টাকা)/u, 3],
  ],
  payment_failed: [
    [/\b(payment|transaction|trx|txn|recharge|cash\s?out|cash\s?in|send\s?money|bill)\b[^.?!]{0,20}\b(fail|failed|declin|unsuccessful|not\s?(complete|go\s?through))/i, 3],
    [/\bfailed\b[^.?!]{0,25}\b(deduct|balance|money|taka|amount|charged)\b/i, 3],
    [/\b(balance|money|taka|amount)\b[^.?!]{0,25}\b(deduct|cut|gone|charged)\b[^.?!]{0,25}\b(but|still|not|fail)/i, 3],
    [/\b(deducted|charged)\b[^.?!]{0,30}\b(not\s?received|didn'?t\s?(get|receive)|no\s?money|failed)/i, 3],
    [/\b(stuck|pending|processing)\b[^.?!]{0,20}\b(payment|transaction|money|amount)\b/i, 1],
    [/(পেমেন্ট|লেনদেন|ট্রানজেকশন)[^।?!]{0,20}(ফেইল|ব্যর্থ|হয়নি)|টাকা\s?(কেটে|কাটা)[^।?!]{0,15}(কিন্তু|হয়নি|যায়নি)/u, 3],
  ],
  refund_request: [
    [/\brefund\b/i, 3],
    [/\b(money|amount|payment)\s?back\b/i, 2],
    [/\b(return|reverse|give\s?back)\b[^.?!]{0,15}\b(my\s?)?(money|payment|amount|transaction)\b/i, 2],
    [/\bchanged?\s?my\s?mind|cancel\b[^.?!]{0,15}\b(order|payment|transaction|subscription)/i, 2],
    [/\b(want|request|need|please)\b[^.?!]{0,15}\brefund\b/i, 3],
    [/ফেরত|রিফান্ড|টাকা\s?ফেরত|মন\s?পরিবর্তন/u, 3],
  ],
  other: [
    [/\b(app|application)\b[^.?!]{0,15}\b(crash|crashed|freeze|hang|not\s?open|won'?t\s?open|stuck|slow|bug|error)\b/i, 2],
    [/\b(can'?t|cannot|unable\s?to)\b[^.?!]{0,15}\b(login|log\s?in|open|access|update|install)\b/i, 2],
    [/\b(how\s?(do|to)|where\s?is|question|enquiry|inquiry|feedback|complain about service)\b/i, 1],
    [/অ্যাপ|অ্যাপস|ক্র্যাশ|খুলছে\s?না|লগইন|ধীর|সমস্যা/u, 1],
  ],
};

// Severity escalators (apply on top of base severity).
const ESCALATORS = [
  [/\b(urgent|emergency|immediately|right\s?now|asap|please\s?help)\b/i, 1],
  [/\b(hack(ed|ing)?|stolen|unauthori[sz]ed|without\s?my\s?(consent|permission)|someone\s?accessed)\b/i, 2],
  [/\b(lost|losing|gone)\b[^.?!]{0,15}\b(money|taka|balance|savings|everything)\b/i, 1],
  [/\b(account\s?(taken|compromis|locked|blocked|hacked))\b/i, 2],
  [/হ্যাক|চুরি|অননুমোদিত|জরুরি/u, 2],
];

// "Contested" refund -> routes to dispute_resolution rather than customer_support.
const CONTESTED = /\b(disput\w*|unauthori[sz]ed|not\s?authori[sz]ed|never\s?(made|ordered)|didn'?t\s?(make|order|receive)|wrong(ly)?\s?charged|double[\s-]?charged|fraud)\b/i;

// Amount extraction (taka / tk / ৳ / bdt / plain large numbers).
function extractAmount(message) {
  const m = message.match(/(?:৳|tk\.?|bdt|taka|tk)\s*([\d,]+(?:\.\d+)?)|([\d,]{3,}(?:\.\d+)?)\s*(?:৳|tk\.?|bdt|taka)/i)
    || message.match(/\b([\d,]{3,}(?:\.\d+)?)\b/);
  if (!m) return null;
  const raw = (m[1] || m[2] || m[0]).replace(/,/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function baseSeverity(caseType) {
  switch (caseType) {
    case 'phishing_or_social_engineering': return 'critical';
    case 'wrong_transfer': return 'high';
    case 'payment_failed': return 'high';
    case 'refund_request': return 'low';
    default: return 'low';
  }
}

// Escalate a non-phishing base severity by accumulated signal weight.
// - any single escalator lifts a sub-`high` case one step toward `high`
// - strong escalation (weight ≥ 2) may push one rank past `high` into `critical`
// - overwhelming escalation (weight ≥ 3) forces `critical`
// Never downgrades below the base rank.
export function escalateSeverityRank(baseRank, escalation) {
  const strong = escalation >= 2 ? 1 : 0;
  let rank = Math.min(RANK.high + strong, baseRank + strong);
  if (escalation >= 1 && rank < RANK.high) rank += 1;
  if (escalation >= 3) rank = RANK.critical;
  return Math.max(RANK.low, Math.min(RANK.critical, rank));
}

export function keywordRulesClassify(message = '', { channel = null, locale = null } = {}) {
  const text = String(message || '');
  const scores = {};
  const matched = [];

  for (const [caseType, rules] of Object.entries(SIGNALS)) {
    let score = 0;
    for (const [re, weight] of rules) {
      if (re.test(text)) {
        score += weight;
        matched.push(caseType);
      }
    }
    scores[caseType] = score;
  }

  // Rank case types by score.
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  let [topType, topScore] = ranked[0];
  const secondScore = ranked[1] ? ranked[1][1] : 0;

  // Phishing safety bias: if any phishing signal fired, never let it be silently
  // beaten by a tie — security wins ties.
  if (scores.phishing_or_social_engineering > 0 &&
      scores.phishing_or_social_engineering >= topScore) {
    topType = 'phishing_or_social_engineering';
    topScore = scores.phishing_or_social_engineering;
  }

  // No signal at all -> "other".
  if (topScore === 0) topType = 'other';

  // --- Severity ---
  let sevRank = RANK[baseSeverity(topType)];
  let escalation = 0;
  for (const [re, w] of ESCALATORS) if (re.test(text)) escalation += w;

  const amount = extractAmount(text);
  if (amount !== null && amount >= 50000) escalation += 1; // large sums raise stakes

  if (topType === 'refund_request') {
    // refunds start low; escalate to medium when contested/large/unauthorized.
    if (CONTESTED.test(text) || (amount !== null && amount >= 20000)) sevRank = Math.max(sevRank, RANK.medium);
  }
  if (topType === 'phishing_or_social_engineering') {
    sevRank = RANK.critical; // phishing is always critical
  } else {
    sevRank = escalateSeverityRank(sevRank, escalation);
  }
  const severity = NAME[sevRank];

  // --- Department ---
  const contested = topType === 'refund_request' && CONTESTED.test(text);
  const department = departmentFor(topType, { contested });

  // --- Confidence: signal strength + margin between top two ---
  let confidence;
  if (topScore === 0) {
    confidence = 0.45; // generic "other" fallback
  } else {
    const strength = Math.min(1, topScore / 5);          // saturates at score 5
    const margin = Math.min(1, (topScore - secondScore) / 4);
    confidence = 0.5 + 0.35 * strength + 0.15 * margin;  // ~0.5..1.0
  }
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;

  return {
    case_type: topType,
    severity,
    department,
    confidence,
    contested,
    amount,
    signals: [...new Set(matched)],
    scores,
  };
}
