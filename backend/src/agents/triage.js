// Agent 1 — Triage. Core of POST /sort-ticket. Rules-first, Gemma-augmented, safety-gated.
import { keywordRulesClassify } from '../tools/rulesClassifier.js';
import { classifyWithGemma } from '../llm/gemma.js';
import { summaryWriter } from '../tools/summary.js';
import { piiSafetyScan, safeSummaryFallback } from '../tools/safety.js';
import { departmentFor, maxSeverity } from '../enums.js';

// T2 confidence_calibrator — agreement between rules and the LLM raises confidence.
function calibrateConfidence(rules, gemma, agreed) {
  if (!gemma) return rules.confidence;
  if (agreed) return Math.round(Math.min(1, (rules.confidence + gemma.confidence) / 2 + 0.1) * 100) / 100;
  // disagreement -> lower confidence, conservative
  return Math.round(Math.max(0.4, Math.min(rules.confidence, gemma.confidence) - 0.05) * 100) / 100;
}

export async function triageAgent({ ticket_id, channel = null, locale = null, message }) {
  const t0 = Date.now();

  // Step 1 — deterministic baseline (always available).
  const rules = keywordRulesClassify(message, { channel, locale });

  // Step 2 — optional LLM (bounded, fails safe to null).
  let gemma = null;
  try {
    gemma = await classifyWithGemma(message, { channel, locale });
  } catch {
    gemma = null;
  }

  // Step 3 — reconcile. Safety-conservative: phishing/critical signals win.
  let method = 'rules';
  let case_type = rules.case_type;
  let severity = rules.severity;

  if (gemma) {
    method = 'hybrid';
    const agreed = gemma.case_type === rules.case_type;
    // If either side says phishing, treat as phishing (security bias).
    if (gemma.case_type === 'phishing_or_social_engineering' ||
        rules.case_type === 'phishing_or_social_engineering') {
      case_type = 'phishing_or_social_engineering';
      severity = 'critical';
    } else if (agreed) {
      case_type = rules.case_type;
      severity = maxSeverity(rules.severity, gemma.severity); // never downgrade
    } else {
      // disagree, non-phishing: prefer rules (auditable) but take the higher severity.
      case_type = rules.case_type;
      severity = maxSeverity(rules.severity, gemma.severity);
    }
  }

  const contested = rules.contested && case_type === 'refund_request';
  const department = departmentFor(case_type, { contested });

  // Step 4 — summary + safety gate (T4 -> T3).
  let agent_summary = summaryWriter(message, { case_type, severity, amount: rules.amount, channel });
  let safety = piiSafetyScan(agent_summary);
  if (!safety.passed) {
    agent_summary = safeSummaryFallback(case_type, { amount: rules.amount });
    safety = piiSafetyScan(agent_summary); // must pass now
  }

  // Step 5 — flag + confidence.
  const human_review_required =
    severity === 'critical' || case_type === 'phishing_or_social_engineering';
  const agreed = gemma ? gemma.case_type === case_type : false;
  const confidence = calibrateConfidence(rules, gemma, agreed);

  const response = {
    ticket_id,
    case_type,
    severity,
    department,
    agent_summary,
    human_review_required,
    confidence,
  };

  return {
    response,
    meta: {
      method,
      safety_passed: safety.passed,
      latency_ms: Date.now() - t0,
      rules,
      gemma,
      amount: rules.amount,
      signals: rules.signals,
    },
  };
}
