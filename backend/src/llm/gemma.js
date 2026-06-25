// Optional LLM augmentation via Ollama (Gemma 4), CPU-only. Always fails safe to null.
// Nothing here is required for a valid response — the rules engine stands alone.
import { config } from '../config.js';
import { CASE_TYPES, SEVERITIES } from '../enums.js';

const { enabled, host, model, timeoutMs } = config.llm;

async function withTimeout(promise, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

let reachableCache = { value: false, at: 0 };

export async function isLlmReachable() {
  if (!enabled) return false;
  // Cache for 5s so /health stays instant.
  if (Date.now() - reachableCache.at < 5000) return reachableCache.value;
  try {
    const ok = await withTimeout(
      (signal) => fetch(`${host}/api/tags`, { signal }).then((r) => r.ok),
      1500,
    );
    reachableCache = { value: ok, at: Date.now() };
    return ok;
  } catch {
    reachableCache = { value: false, at: Date.now() };
    return false;
  }
}

async function ollamaJson(prompt, { temperature = 0.1 } = {}) {
  if (!enabled) return null;
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(`${host}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            format: 'json',
            options: { temperature, num_predict: 256 },
          }),
        }),
      timeoutMs,
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    return JSON.parse(data.response);
  } catch {
    return null; // timeout / not running / bad json -> rules fallback
  }
}

export async function classifyWithGemma(message, { channel = null, locale = null } = {}) {
  const prompt = `You are a ticket triage classifier for a digital finance company.
Classify the customer message. Respond ONLY as compact JSON with keys:
"case_type" (one of: ${CASE_TYPES.join(', ')}),
"severity" (one of: ${SEVERITIES.join(', ')}),
"confidence" (number 0..1).
Rules: phishing/social-engineering (someone asking for OTP/PIN/password) is always "critical".
Never include any request for the customer's PIN, OTP, password, or card.
channel=${channel || 'unknown'} locale=${locale || 'unknown'}
Message: """${String(message).slice(0, 2000)}"""`;
  const out = await ollamaJson(prompt, { temperature: 0.1 });
  if (!out) return null;
  const case_type = CASE_TYPES.includes(out.case_type) ? out.case_type : null;
  const severity = SEVERITIES.includes(out.severity) ? out.severity : null;
  if (!case_type || !severity) return null;
  let confidence = Number(out.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.6;
  confidence = Math.max(0, Math.min(1, confidence));
  return { case_type, severity, confidence };
}

export async function generateTextWithGemma(prompt, { temperature = 0.4 } = {}) {
  if (!enabled) return null;
  try {
    const res = await withTimeout(
      (signal) =>
        fetch(`${host}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            model,
            prompt,
            stream: false,
            options: { temperature, num_predict: 220 },
          }),
        }),
      timeoutMs,
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    return String(data.response || '').trim() || null;
  } catch {
    return null;
  }
}
