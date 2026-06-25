// T4 summary_writer — neutral 1–2 sentence agent summary (rules template path).
// Always safety-clean by construction; still passed through the scanner upstream.
import { safeSummaryFallback } from './safety.js';

function snippet(message, max = 90) {
  const s = String(message || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export function summaryWriter(message, { case_type, severity, amount = null, channel = null }) {
  const amt = amount ? `${amount} BDT ` : '';
  const via = channel && channel !== 'app' ? ` via ${channel.replace('_', ' ')}` : '';
  switch (case_type) {
    case 'wrong_transfer':
      return `Customer reports sending ${amt}to a wrong recipient${via} and requests recovery of the funds.`;
    case 'payment_failed':
      return `Customer reports a payment that failed${via}${amt ? ` for ${amt}` : ''} while the balance may have been deducted.`;
    case 'refund_request':
      return `Customer requests a refund for a recent transaction${amt ? ` of ${amt}` : ''}${via}.`;
    case 'phishing_or_social_engineering':
      return `Customer reports a suspicious contact attempting to obtain sensitive account details${via}; escalated for fraud review.`;
    case 'other':
    default: {
      const s = snippet(message);
      return s ? `Customer reports a general issue: "${s}". Routed to support for assistance.`
               : safeSummaryFallback('other');
    }
  }
}
