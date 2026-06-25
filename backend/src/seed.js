// Seed the database with realistic tickets (en/bn/mixed) so the dashboards are populated.
// Runs everything through the real pipeline, exactly like POST /sort-ticket.
import { sortTicket } from './orchestrator.js';

const SAMPLES = [
  // The 5 public sample cases from the spec.
  { channel: 'app', locale: 'en', message: 'I sent 3000 to wrong number' },
  { channel: 'app', locale: 'en', message: 'Payment failed but balance deducted' },
  { channel: 'sms', locale: 'en', message: 'Someone called asking my OTP, is that bKash?' },
  { channel: 'app', locale: 'en', message: 'Please refund my last transaction, I changed my mind' },
  { channel: 'app', locale: 'en', message: 'App crashed when I opened it' },

  // Wrong transfer variations
  { channel: 'app', locale: 'en', message: 'I accidentally sent 12000 taka to the wrong bKash number this morning, please help me get it back' },
  { channel: 'bn', locale: 'bn', message: 'ভুল নাম্বারে ৫০০০ টাকা চলে গেছে, ফেরত পাওয়ার ব্যবস্থা করুন' },
  { channel: 'merchant_portal', locale: 'mixed', message: 'Vai wrong number e 2500 send kore felechi, ki korbo?' },

  // Payment failed variations
  { channel: 'app', locale: 'en', message: 'My cash out failed but 4000 was deducted from my balance' },
  { channel: 'bn', locale: 'bn', message: 'পেমেন্ট হয়নি কিন্তু টাকা কেটে নিয়েছে' },
  { channel: 'app', locale: 'mixed', message: 'Recharge failed but taka cut hoye geche, ekhono pai nai' },

  // Phishing / social engineering (critical)
  { channel: 'call_center', locale: 'en', message: 'A man called saying he is from bKash and asked me to share my OTP to unblock my account' },
  { channel: 'sms', locale: 'en', message: 'I got an SMS that I won a 50000 prize, click this link and verify with my PIN' },
  { channel: 'bn', locale: 'bn', message: 'একজন ফোন দিয়ে বিকাশ এজেন্ট পরিচয়ে আমার পিন চাইছে, এটা কি আসল?' },
  { channel: 'sms', locale: 'en', message: 'Suspicious message asking me to update my account or it will be blocked in 24 hours' },

  // Refund requests
  { channel: 'app', locale: 'en', message: 'I want a refund for my mobile recharge, I changed my mind' },
  { channel: 'app', locale: 'en', message: 'Please refund the double charge on my last bill payment, this was unauthorized' },
  { channel: 'bn', locale: 'bn', message: 'আমার শেষ লেনদেনের টাকা ফেরত চাই' },

  // Other
  { channel: 'app', locale: 'en', message: 'The app is very slow today and keeps freezing' },
  { channel: 'app', locale: 'en', message: 'How do I change my registered email address?' },
  { channel: 'bn', locale: 'bn', message: 'অ্যাপে লগইন করতে পারছি না, সমস্যা হচ্ছে' },

  // Higher-stakes escalations
  { channel: 'app', locale: 'en', message: 'URGENT! Someone hacked my account and made unauthorized transfers, I lost everything' },
  { channel: 'call_center', locale: 'en', message: 'My account was blocked without my consent and a large amount is missing' },
];

let n = 0;
for (const s of SAMPLES) {
  n += 1;
  const ticket_id = `T-${String(1000 + n)}`;
  // eslint-disable-next-line no-await-in-loop
  const { response } = await sortTicket({ ticket_id, ...s });
  console.log(
    `${ticket_id}  ${response.case_type.padEnd(32)} ${response.severity.padEnd(8)} ` +
      `${response.department.padEnd(20)} flag=${response.human_review_required ? 'Y' : 'n'} conf=${response.confidence}`,
  );
}
console.log(`\n[seed] inserted ${n} tickets.`);
process.exit(0);
