// Request validation for POST /sort-ticket. Lightweight, dependency-free.
import { CHANNELS, LOCALES } from './enums.js';

const MAX_MESSAGE = 8192;

export function validateSortTicket(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'invalid_body', detail: 'Request body must be a JSON object.' };
  }
  const ticket_id = body.ticket_id;
  if (typeof ticket_id !== 'string' || ticket_id.trim() === '') {
    return { ok: false, error: 'missing_ticket_id', detail: 'ticket_id is required and must be a non-empty string.' };
  }
  const message = body.message;
  if (typeof message !== 'string' || message.trim() === '') {
    return { ok: false, error: 'missing_message', detail: 'message is required and must be a non-empty string.' };
  }
  // Optional fields: accept but normalize unknown values to null (never reject on optionals).
  const channel = CHANNELS.includes(body.channel) ? body.channel : null;
  const locale = LOCALES.includes(body.locale) ? body.locale : null;

  return {
    ok: true,
    value: {
      ticket_id: ticket_id.trim(),
      channel,
      locale,
      message: message.slice(0, MAX_MESSAGE),
    },
  };
}
