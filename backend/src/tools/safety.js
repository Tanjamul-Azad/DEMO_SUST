// T3 pii_safety_scanner — the release-blocking safety gate.
// Fails ONLY when text *asks the customer to share* PIN/OTP/password/full card.
// Passes when text merely *describes* such a request, or *warns against* sharing.

// Negation / warning markers -> the sentence is safe even if it mentions a secret.
const NEGATION = /\b(never|do\s?not|don'?t|do\s?n'?t|should\s?not|shouldn'?t|won'?t|will\s?not|cannot|can'?t|avoid|no\s?need|not\s?ask|without\s?(asking|sharing))\b/i;
const NEGATION_BN = /কখনো|কখনই|দেবেন\s?না|দিবেন\s?না|শেয়ার\s?করবেন\s?না|বলবেন\s?না/u;

// Imperative / interrogative requests for a secret, directed at the customer.
const UNSAFE = [
  /\b(share|send|give|provide|tell|enter|type|input|confirm|verify|reveal|forward|hand\s?over)\b[^.?!]{0,40}\byour\b[^.?!]{0,25}\b(otp|pin|pass\s?word|passcode|cvv|card\s?(number|details|pin)|one[\s-]?time\s?(password|code|pin))/i,
  /\byour\b[^.?!]{0,20}\b(otp|pin|pass\s?word|passcode|cvv)\b[^.?!]{0,30}\b(share|send|provide|needed|required|please|now)\b/i,
  /\bwhat(?:'s|\s?is|\s?are)\b[^.?!]{0,20}\byour\b[^.?!]{0,20}\b(otp|pin|pass\s?word|passcode|cvv|card)/i,
  /\b(may\s?i\s?(have|get)|can\s?(you|i)\s?(get|have)|need|require)\b[^.?!]{0,25}\byour\b[^.?!]{0,20}\b(otp|pin|pass\s?word|passcode|cvv|card)/i,
  /\b(enter|provide|give|send|share|tell)\s?(me\s?)?(the\s?|your\s?)?(otp|pin|pass\s?word|passcode|cvv)\b/i,
];

const UNSAFE_BN = /(আপনার|তোমার|তোমাদের)\s?(ওটিপি|পিন|পাসওয়ার্ড|পাসকোড)[^।?!]{0,20}(দিন|দাও|বলুন|বলো|শেয়ার\s?কর|পাঠান|জানান|লিখুন)/u;

function splitSentences(text) {
  return String(text || '').split(/[.?!।\n]+/).map((s) => s.trim()).filter(Boolean);
}

export function piiSafetyScan(text) {
  const hits = [];
  for (const sentence of splitSentences(text)) {
    if (NEGATION.test(sentence) || NEGATION_BN.test(sentence)) continue; // warning => safe
    for (const re of UNSAFE) {
      const m = sentence.match(re);
      if (m) hits.push(m[0].trim());
    }
    const bn = sentence.match(UNSAFE_BN);
    if (bn) hits.push(bn[0].trim());
  }
  return { passed: hits.length === 0, hits: [...new Set(hits)] };
}

// Known-safe neutral summary used when generated text fails the gate.
export function safeSummaryFallback(caseType, { amount = null } = {}) {
  const amt = amount ? `${amount} BDT ` : '';
  switch (caseType) {
    case 'wrong_transfer':
      return `Customer reports sending ${amt}to the wrong recipient and requests recovery.`;
    case 'payment_failed':
      return `Customer reports a failed payment where ${amt ? amt + 'was' : 'the balance may have been'} deducted.`;
    case 'refund_request':
      return `Customer is requesting a refund for a recent transaction.`;
    case 'phishing_or_social_engineering':
      return `Customer reports a suspicious contact attempting to obtain sensitive account information; flagged for fraud review.`;
    case 'other':
    default:
      return `Customer reports a general issue requiring support assistance.`;
  }
}
