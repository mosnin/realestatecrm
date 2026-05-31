/**
 * Mail send validator — pure, framework-agnostic. Mirrors
 * `lib/calendar/event-validation.ts`: lives outside `route.ts` because
 * Next App Router rejects non-handler exports from a route file.
 *
 * One reason this exists: the UI lets the realtor enter a comma-
 * separated string in the To/Cc/Bcc fields. The route handler shouldn't
 * have to deal with that — it should get a clean validated payload.
 * Bad shapes get rejected with a copy-ready error message, not a 500
 * from inside Composio.
 */

export interface SendMailBody {
  slug?: unknown;
  to?: unknown;        // string | string[]
  cc?: unknown;
  bcc?: unknown;
  subject?: unknown;
  body?: unknown;
  /** Optional thread context (basic reply support). */
  inReplyToId?: unknown;
}

export interface ValidatedSend {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  inReplyToId: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_RECIPIENTS = 50;
const MAX_SUBJECT = 250;
const MAX_BODY = 50_000;

/**
 * Split a string or string[] into a normalized email[] (trimmed,
 * deduped). Returns null on a non-string/non-array input — distinct from
 * "empty list", which is a valid intermediate. Callers decide whether
 * empty is allowed (To: no, Cc: yes).
 */
function parseRecipients(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  const raw: string[] = [];
  if (typeof value === 'string') {
    raw.push(...value.split(','));
  } else if (Array.isArray(value)) {
    for (const v of value) {
      if (typeof v !== 'string') return null;
      // Allow nested commas inside an array entry — realtors paste lists.
      raw.push(...v.split(','));
    }
  } else {
    return null;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const trimmed = r.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

export function validateSendPayload(
  body: SendMailBody,
): { ok: true; value: ValidatedSend } | { ok: false; error: string } {
  const to = parseRecipients(body.to);
  if (to === null) return { ok: false, error: 'Recipients are malformed.' };
  if (to.length === 0) return { ok: false, error: 'Add a recipient.' };
  if (to.length > MAX_RECIPIENTS) {
    return { ok: false, error: 'Too many recipients.' };
  }
  for (const addr of to) {
    if (!EMAIL_RE.test(addr)) {
      return { ok: false, error: `Invalid email: ${addr}` };
    }
  }

  const cc = parseRecipients(body.cc);
  if (cc === null) return { ok: false, error: 'Cc is malformed.' };
  for (const addr of cc) {
    if (!EMAIL_RE.test(addr)) {
      return { ok: false, error: `Invalid Cc: ${addr}` };
    }
  }

  const bcc = parseRecipients(body.bcc);
  if (bcc === null) return { ok: false, error: 'Bcc is malformed.' };
  for (const addr of bcc) {
    if (!EMAIL_RE.test(addr)) {
      return { ok: false, error: `Invalid Bcc: ${addr}` };
    }
  }

  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) {
    return { ok: false, error: 'Too many recipients.' };
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  if (!subject) return { ok: false, error: 'Subject is required.' };
  if (subject.length > MAX_SUBJECT) {
    return { ok: false, error: 'Subject is too long.' };
  }

  const bodyText = typeof body.body === 'string' ? body.body : '';
  // Don't .trim() the body — realtors sometimes intentionally include
  // leading/trailing whitespace for signatures and quoted replies.
  if (bodyText.trim().length === 0) {
    return { ok: false, error: 'Write something in the body.' };
  }
  if (bodyText.length > MAX_BODY) {
    return { ok: false, error: 'Body is too long.' };
  }

  const inReplyToId =
    typeof body.inReplyToId === 'string' && body.inReplyToId.trim()
      ? body.inReplyToId.trim()
      : null;

  return {
    ok: true,
    value: { to, cc, bcc, subject, body: bodyText, inReplyToId },
  };
}
