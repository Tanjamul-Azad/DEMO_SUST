// Agent 3 — Copilot. Drafts a SAFE agent reply. Template-first, Gemma-personalized, safety-gated.
import { generateTextWithGemma } from '../llm/gemma.js';
import { piiSafetyScan } from '../tools/safety.js';
import { insertReply } from '../repo.js';

// T10 template_retriever — approved, PIN/OTP-safe reply skeletons.
const TEMPLATES = {
  en: {
    wrong_transfer:
      'Thank you for reaching out. We understand you sent money to the wrong recipient. We have logged your case for our dispute resolution team, who will attempt to recover the funds. We will never ask you for your PIN, OTP, or password.',
    payment_failed:
      'Thank you for contacting us. We are sorry your payment failed while the amount may have been deducted. Our payments team is reviewing the transaction and any deducted amount will be reversed if the payment did not complete. We will never ask you for your PIN, OTP, or password.',
    refund_request:
      'Thank you for your message. We have received your refund request and our support team will review it shortly and update you on the status. We will never ask you for your PIN, OTP, or password.',
    phishing_or_social_engineering:
      'Thank you for reporting this. This looks like a scam attempt. Please do not share your PIN, OTP, or password with anyone — bKash will never ask for them. We have escalated this to our fraud team for immediate review.',
    other:
      'Thank you for getting in touch. We have received your message and our support team will look into it and get back to you. We will never ask you for your PIN, OTP, or password.',
  },
  bn: {
    wrong_transfer:
      'আপনার বার্তার জন্য ধন্যবাদ। আপনি ভুল নম্বরে টাকা পাঠিয়েছেন বলে জানিয়েছেন। আমরা বিষয়টি ডিসপিউট টিমে পাঠিয়েছি, তারা টাকা ফেরতের চেষ্টা করবে। আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড চাইব না।',
    payment_failed:
      'যোগাযোগের জন্য ধন্যবাদ। পেমেন্ট ব্যর্থ হয়েছে অথচ টাকা কেটে নেওয়া হতে পারে—এজন্য দুঃখিত। আমাদের পেমেন্ট টিম লেনদেনটি যাচাই করছে এবং কাটা টাকা ফেরত দেওয়া হবে। আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড চাইব না।',
    refund_request:
      'আপনার বার্তার জন্য ধন্যবাদ। আপনার রিফান্ড অনুরোধ আমরা পেয়েছি এবং শীঘ্রই যাচাই করে জানাব। আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড চাইব না।',
    phishing_or_social_engineering:
      'জানানোর জন্য ধন্যবাদ। এটি একটি প্রতারণার চেষ্টা বলে মনে হচ্ছে। অনুগ্রহ করে কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড কারও সাথে শেয়ার করবেন না—বিকাশ কখনো এগুলো চায় না। বিষয়টি আমাদের ফ্রড টিমে পাঠানো হয়েছে।',
    other:
      'যোগাযোগের জন্য ধন্যবাদ। আপনার বার্তা পেয়েছি, আমাদের টিম বিষয়টি দেখে আপনাকে জানাবে। আমরা কখনোই আপনার পিন, ওটিপি বা পাসওয়ার্ড চাইব না।',
  },
};

function pickLocale(locale) {
  if (locale === 'bn') return 'bn';
  return 'en'; // en + mixed default to English skeleton
}

export async function copilotAgent({ ticket_id, message, case_type, locale = 'en' }) {
  const loc = pickLocale(locale);
  const template = (TEMPLATES[loc] && TEMPLATES[loc][case_type]) || TEMPLATES.en.other;

  let draft = template;
  let method = 'rules';

  // Optional Gemma personalization within safe bounds.
  const gen = await generateTextWithGemma(
    `Rewrite the following customer-support reply to be warm and concise (max 60 words). ` +
      `Keep all safety wording. NEVER ask the customer for PIN, OTP, password, or card number. ` +
      `Reply language: ${loc === 'bn' ? 'Bangla' : 'English'}.\n\nReply: """${template}"""`,
    { temperature: 0.4 },
  ).catch(() => null);

  if (gen) {
    const check = piiSafetyScan(gen);
    if (check.passed) {
      draft = gen;
      method = 'gemma';
    }
  }

  // Final hard gate. If the chosen draft ever fails, fall back to the approved template.
  let policy = piiSafetyScan(draft);
  if (!policy.passed) {
    draft = template;
    method = 'rules';
    policy = piiSafetyScan(draft);
  }

  insertReply({ ticket_id, locale, draft, policy_passed: policy.passed, method });
  return { ticket_id, draft, method, policy_passed: policy.passed };
}
