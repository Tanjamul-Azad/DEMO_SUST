// Display helpers: labels, colors, formatters for the domain enums.

export const SEVERITY_COLOR = {
  low: '#5FB587',
  medium: '#E0B23C',
  high: '#F0743A',
  critical: '#FF3B5C',
};

export const DEPT_COLOR = {
  customer_support: '#34C7E0',
  dispute_resolution: '#7A5CFF',
  payments_ops: '#E0B23C',
  fraud_risk: '#FF3D81',
};

export const CASE_COLOR = {
  wrong_transfer: '#7A5CFF',
  payment_failed: '#E0B23C',
  refund_request: '#34C7E0',
  phishing_or_social_engineering: '#FF3D81',
  other: '#8A857C',
};

const TITLE = (s) =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const label = {
  case: (c) => TITLE(c),
  severity: (s) => TITLE(s),
  dept: (d) => TITLE(d),
};

export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso.includes('Z') || iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - t.getTime()) / 1000;
  if (diff < 60) return `${Math.max(0, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function countdown(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  const diff = Math.floor((t - Date.now()) / 1000);
  const sign = diff < 0 ? '-' : '';
  const a = Math.abs(diff);
  const m = String(Math.floor(a / 60)).padStart(2, '0');
  const s = String(a % 60).padStart(2, '0');
  return `${sign}${m}:${s}`;
}

export const SAMPLE_MESSAGES = [
  { label: 'Wrong transfer', channel: 'app', locale: 'en', message: 'I sent 3000 to wrong number' },
  { label: 'Payment failed', channel: 'app', locale: 'en', message: 'Payment failed but balance deducted' },
  { label: 'Phishing (OTP)', channel: 'sms', locale: 'en', message: 'Someone called asking my OTP, is that bKash?' },
  { label: 'Refund', channel: 'app', locale: 'en', message: 'Please refund my last transaction, I changed my mind' },
  { label: 'Other', channel: 'app', locale: 'en', message: 'App crashed when I opened it' },
  { label: 'Bangla — ভুল নম্বর', channel: 'app', locale: 'bn', message: 'ভুল নাম্বারে ৫০০০ টাকা চলে গেছে, ফেরত দিন' },
];
