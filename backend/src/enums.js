// Authoritative enums + mappings from the task spec. Single source of truth.

export const CASE_TYPES = [
  'wrong_transfer',
  'payment_failed',
  'refund_request',
  'phishing_or_social_engineering',
  'other',
];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export const DEPARTMENTS = [
  'customer_support',
  'dispute_resolution',
  'payments_ops',
  'fraud_risk',
];

export const CHANNELS = ['app', 'sms', 'call_center', 'merchant_portal'];
export const LOCALES = ['bn', 'en', 'mixed'];

export const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

// case_type -> department (spec §4.2). refund_request is context-dependent.
export function departmentFor(caseType, { contested = false } = {}) {
  switch (caseType) {
    case 'wrong_transfer':
      return 'dispute_resolution';
    case 'payment_failed':
      return 'payments_ops';
    case 'phishing_or_social_engineering':
      return 'fraud_risk';
    case 'refund_request':
      return contested ? 'dispute_resolution' : 'customer_support';
    case 'other':
    default:
      return 'customer_support';
  }
}

export const isValidSeverity = (s) => SEVERITIES.includes(s);
export const isValidCaseType = (c) => CASE_TYPES.includes(c);
export const isValidDepartment = (d) => DEPARTMENTS.includes(d);

// Pick the more severe of two severities.
export function maxSeverity(a, b) {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}
