// Orchestrator — runs Triage synchronously, persists, then fires Sentinel for flagged cases.
// Keeps POST /sort-ticket fast: Copilot/Insights are off the hot path.
import { triageAgent } from './agents/triage.js';
import { sentinelAgent } from './agents/sentinel.js';
import { upsertTicket, insertClassification } from './repo.js';

export async function sortTicket(input) {
  const { response, meta } = await triageAgent(input);

  // Persist ticket + classification (append-only).
  try {
    upsertTicket({
      ticket_id: input.ticket_id,
      channel: input.channel ?? null,
      locale: input.locale ?? null,
      message: input.message,
    });
    insertClassification({
      ticket_id: response.ticket_id,
      case_type: response.case_type,
      severity: response.severity,
      department: response.department,
      agent_summary: response.agent_summary,
      human_review_required: response.human_review_required,
      confidence: response.confidence,
      method: meta.method,
      safety_passed: meta.safety_passed,
      latency_ms: meta.latency_ms,
    });

    // Hand off flagged cases to Sentinel (synchronous, but cheap; pure CPU).
    if (response.human_review_required) {
      sentinelAgent({
        ticket_id: response.ticket_id,
        message: input.message,
        case_type: response.case_type,
        severity: response.severity,
      });
    }
  } catch (err) {
    // Persistence must never break the API contract — log and return the response anyway.
    console.error('[orchestrator] persist failed:', err.message);
  }

  return { response, meta };
}
