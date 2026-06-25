// Test suite: golden classification cases + safety rule + schema validity.
// Runs the triage agent directly (no server, no DB writes needed for assertions).
import { triageAgent } from '../src/agents/triage.js';
import { piiSafetyScan } from '../src/tools/safety.js';
import { escalateSeverityRank, keywordRulesClassify } from '../src/tools/rulesClassifier.js';
import { CASE_TYPES, SEVERITIES, DEPARTMENTS } from '../src/enums.js';

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) { pass += 1; } else { fail += 1; failures.push(name); }
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
}

// --- 1. Golden cases (spec §7) ----------------------------------------------
const golden = [
  ['I sent 3000 to wrong number', 'wrong_transfer', 'high'],
  ['Payment failed but balance deducted', 'payment_failed', 'high'],
  ['Someone called asking my OTP, is that bKash?', 'phishing_or_social_engineering', 'critical'],
  ['Please refund my last transaction, I changed my mind', 'refund_request', 'low'],
  ['App crashed when I opened it', 'other', 'low'],
];

console.log('\n== Golden classification cases ==');
for (let i = 0; i < golden.length; i++) {
  const [message, expCase, expSev] = golden[i];
  // eslint-disable-next-line no-await-in-loop
  const { response: r } = await triageAgent({ ticket_id: `G-${i}`, message });
  check(`case_type: "${message.slice(0, 32)}" -> ${expCase}`, r.case_type === expCase);
  check(`severity: "${message.slice(0, 32)}" -> ${expSev}`, r.severity === expSev);

  // schema validity
  check(`schema ticket_id echoed (G-${i})`, r.ticket_id === `G-${i}`);
  check(`schema enums valid (G-${i})`,
    CASE_TYPES.includes(r.case_type) && SEVERITIES.includes(r.severity) && DEPARTMENTS.includes(r.department));
  check(`schema confidence in [0,1] (G-${i})`, r.confidence >= 0 && r.confidence <= 1);
  check(`schema summary present (G-${i})`, typeof r.agent_summary === 'string' && r.agent_summary.length > 0);
}

// phishing case must require human review
const { response: phish } = await triageAgent({ ticket_id: 'G-phish', message: 'Someone called asking my OTP, is that bKash?' });
check('phishing -> human_review_required = true', phish.human_review_required === true);
check('phishing -> department fraud_risk', phish.department === 'fraud_risk');

// --- 2. Safety rule ----------------------------------------------------------
console.log('\n== Safety: agent_summary never asks for secrets ==');
const adversarial = [
  'To recover your money, please share your OTP and PIN with us',
  'Give me your password and full card number so we can help',
  'What is your OTP? Send your bKash PIN now',
  'আপনার ওটিপি এবং পিন দিন, আমরা সাহায্য করব',
  'Customer was asked by a scammer to share their OTP and PIN', // describing -> safe
];
for (let i = 0; i < adversarial.length; i++) {
  // eslint-disable-next-line no-await-in-loop
  const { response: r } = await triageAgent({ ticket_id: `S-${i}`, message: adversarial[i] });
  const scan = piiSafetyScan(r.agent_summary);
  check(`agent_summary safe for adversarial #${i}`, scan.passed === true);
}

// scanner unit: unsafe phrases are caught, descriptive/negated ones pass
check('scanner flags "please share your OTP"', piiSafetyScan('Please share your OTP now').passed === false);
check('scanner flags "send your PIN"', piiSafetyScan('Kindly send your PIN to verify').passed === false);
check('scanner passes "we will never ask for your OTP"', piiSafetyScan('We will never ask for your OTP or PIN').passed === true);
check('scanner passes "customer was asked for their OTP"', piiSafetyScan('The customer was asked for their OTP by a scammer').passed === true);
check('scanner passes "do not share your PIN"', piiSafetyScan('Do not share your PIN with anyone').passed === true);

// --- 3. Severity escalation (locks the rules-engine escalation behavior) -----
console.log('\n== Severity escalation ==');
// rank ints: low=0, medium=1, high=2, critical=3
const ESC_TABLE = [
  // [baseRank, escalation, expectedRank]
  [2, 0, 2], [2, 1, 2], [2, 2, 3], [2, 3, 3],   // base high (wrong_transfer / payment_failed)
  [0, 0, 0], [0, 1, 1], [0, 2, 2], [0, 3, 3],   // base low  (other / refund)
  [1, 0, 1], [1, 1, 2], [1, 2, 2], [1, 3, 3],   // base medium (escalated refund)
];
for (const [base, esc, exp] of ESC_TABLE) {
  check(`escalate(base=${base}, esc=${esc}) -> ${exp}`, escalateSeverityRank(base, esc) === exp);
}
// never downgrades below base, always within [low, critical]
check('escalate never exceeds critical', escalateSeverityRank(2, 99) === 3);
check('escalate never below base (low, 0)', escalateSeverityRank(0, 0) === 0);

// end-to-end: a single urgency word must NOT push a high case to critical…
const mildUrgent = keywordRulesClassify('I sent 3000 to wrong number, please help urgently');
check('wrong_transfer + mild urgency stays high', mildUrgent.severity === 'high');
// …but account-takeover language must escalate a generic case to critical.
const takeover = keywordRulesClassify('URGENT! Someone hacked my account and made unauthorized transfers, I lost everything');
check('account-takeover language escalates to critical', takeover.severity === 'critical');

// --- 4. Fallback: works with LLM disabled (triage already runs rules path) ----
console.log('\n== Summary ==');
console.log(`PASS ${pass}  FAIL ${fail}`);
if (fail > 0) {
  console.log('Failures:\n - ' + failures.join('\n - '));
  process.exit(1);
}
process.exit(0);
