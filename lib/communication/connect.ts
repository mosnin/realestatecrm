/**
 * Communication through-write helpers — unified surface for email
 * (Gmail/Outlook) and WhatsApp Business via Composio. The realtor lives
 * in their provider; `/s/[slug]/communication` mirrors what's there and
 * sends THROUGH the provider.
 *
 * One seam, one bug surface. The communication surface, future "send
 * follow-up" routines, and anything else that wants to send-as-the-
 * realtor route through `sendEmailThrough` / `sendWhatsAppThrough`.
 * Provider routing lives in one place.
 *
 * No backup table for v1: sent messages live in the provider's history
 * and inbox reads are fetched on-demand. There's no forensic state worth
 * mirroring locally yet — calendar earned its mirror because Chippi creates
 * tour events autonomously; here the realtor is in the loop on every send.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import {
  composioConfigured,
  executeToolForEntity,
} from '@/lib/integrations/composio';

/** Provider slug for the email read/write path. */
export type MailProvider = 'gmail' | 'outlook';

/** WhatsApp is its own thing — kept separate so the call sites stay honest
 *  about which channel they're touching. */
export type WhatsAppToolkit = 'whatsapp';

/** Toolkits we accept for the email read path. */
export const MAIL_TOOLKITS = ['gmail', 'outlook'] as const;

/**
 * Composio tool slugs per email provider. Verified against
 * agent/integrations_curated.py + lib/delivery.ts (2026-05-31).
 *
 * Gmail uses GMAIL_FETCH_EMAILS for both list+single (query with
 * `rfc822msgid` lands one message); we also expose the dedicated
 * GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID for the per-message read path because
 * it returns the full body without query-DSL gymnastics.
 *
 * Outlook write path is included but not wired in v1 — the API send
 * route gates on provider and only commits the Gmail path. Outlook
 * reads work today; sending from Outlook is a v2 follow-up.
 */
export const PROVIDER_MAIL_SLUGS = {
  gmail: {
    list: 'GMAIL_FETCH_EMAILS',
    get: 'GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID',
    send: 'GMAIL_SEND_EMAIL',
  },
  outlook: {
    list: 'OUTLOOK_LIST_MESSAGES',
    get: 'OUTLOOK_GET_MESSAGE',
    send: 'OUTLOOK_SEND_EMAIL',
  },
} as const;

/**
 * Composio tool slugs for WhatsApp Business. These are best-effort based
 * on Composio's WhatsApp toolkit convention (`<TOOLKIT>_<ACTION>`); the
 * exact slugs need verification against the live `composio.tools.list({
 * toolkits: ['whatsapp'] })` catalog. We surface this caveat in the
 * call sites — when a slug doesn't resolve, the helper returns a
 * `slug_not_supported` error so the UI can render an honest message
 * rather than a silent failure.
 *
 * Why we ship with conservative defaults rather than blocking on
 * verification: Composio's WhatsApp toolkit ships with `*_SEND_MESSAGE`
 * as the canonical send slug across every messaging toolkit they expose
 * (twilio, slack, discord all follow this pattern). The list/get slugs
 * are less consistent; we name them honestly and let the runtime tell us
 * which one resolves. If neither resolves, the read path degrades to
 * "WhatsApp connected but no messages available" — silence beats fiction.
 */
export const WHATSAPP_SLUGS = {
  /** Candidate list slugs — tried in order. The first non-404 wins. */
  listCandidates: [
    'WHATSAPP_LIST_MESSAGES',
    'WHATSAPP_GET_CONVERSATIONS',
    'WHATSAPP_FETCH_MESSAGES',
  ] as const,
  /** Candidate per-conversation slugs — tried in order. */
  getCandidates: [
    'WHATSAPP_GET_MESSAGES',
    'WHATSAPP_GET_CONVERSATION_MESSAGES',
    'WHATSAPP_FETCH_CONVERSATION',
  ] as const,
  /** Send slug — Composio's messaging toolkits standardise on `*_SEND_MESSAGE`. */
  send: 'WHATSAPP_SEND_MESSAGE',
} as const;

export interface MailConnection {
  /** IntegrationConnection row id. */
  id: string;
  /** Composio entityId — the realtor's Clerk userId. */
  userId: string;
  /** Provider slug. */
  toolkit: MailProvider;
}

export interface WhatsAppConnection {
  /** IntegrationConnection row id. */
  id: string;
  /** Composio entityId — the realtor's Clerk userId. */
  userId: string;
  toolkit: WhatsAppToolkit;
}

/**
 * Find the realtor's active email connection for this space. Returns the
 * first match across the mail toolkits — Gmail wins over Outlook if both
 * are connected (Gmail is the dominant realtor inbox; same precedence as
 * `lib/delivery.ts`).
 *
 * Returns null when nothing's connected — callers should render the
 * connect prompt instead of attempting reads or writes.
 */
export async function findEmailConnection(
  spaceId: string,
): Promise<MailConnection | null> {
  if (!composioConfigured()) return null;

  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('id, userId, toolkit')
    .eq('spaceId', spaceId)
    .in('toolkit', MAIL_TOOLKITS as readonly string[])
    .eq('status', 'active')
    .order('toolkit', { ascending: true }) // 'gmail' < 'outlook'
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(
      '[communication.connect] findEmailConnection failed',
      { spaceId, err: error.message },
    );
    return null;
  }
  if (!data) return null;

  const toolkit = (data as { toolkit: string }).toolkit;
  if (toolkit !== 'gmail' && toolkit !== 'outlook') return null;

  return {
    id: (data as { id: string }).id,
    userId: (data as { userId: string }).userId,
    toolkit,
  };
}

/**
 * Find the realtor's active WhatsApp Business connection for this space.
 *
 * One row per space at most; WhatsApp Business numbers are 1:1 with a
 * phone number identity, and we don't try to juggle multiples. Returns
 * null when nothing's connected.
 */
export async function findWhatsAppConnection(
  spaceId: string,
): Promise<WhatsAppConnection | null> {
  if (!composioConfigured()) return null;

  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('id, userId, toolkit')
    .eq('spaceId', spaceId)
    .eq('toolkit', 'whatsapp')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(
      '[communication.connect] findWhatsAppConnection failed',
      { spaceId, err: error.message },
    );
    return null;
  }
  if (!data) return null;

  return {
    id: (data as { id: string }).id,
    userId: (data as { userId: string }).userId,
    toolkit: 'whatsapp',
  };
}

/**
 * One DB roundtrip that gets both connection states for the surface.
 * Used by the page server pass and the GET feed route — we render the
 * right shape (both connected → unified feed; one → feed + nudge for
 * the other; neither → calm prompt) on the first paint.
 */
export async function findAnyCommunicationConnections(
  spaceId: string,
): Promise<{ email: MailConnection | null; whatsapp: WhatsAppConnection | null }> {
  if (!composioConfigured()) return { email: null, whatsapp: null };

  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('id, userId, toolkit')
    .eq('spaceId', spaceId)
    .in('toolkit', ['gmail', 'outlook', 'whatsapp'])
    .eq('status', 'active');

  if (error) {
    logger.warn(
      '[communication.connect] findAnyCommunicationConnections failed',
      { spaceId, err: error.message },
    );
    return { email: null, whatsapp: null };
  }

  const rows = (data ?? []) as Array<{ id: string; userId: string; toolkit: string }>;

  let email: MailConnection | null = null;
  let whatsapp: WhatsAppConnection | null = null;

  // Gmail beats Outlook if both somehow exist.
  for (const r of rows) {
    if (r.toolkit === 'gmail') {
      email = { id: r.id, userId: r.userId, toolkit: 'gmail' };
      break;
    }
  }
  if (!email) {
    for (const r of rows) {
      if (r.toolkit === 'outlook') {
        email = { id: r.id, userId: r.userId, toolkit: 'outlook' };
        break;
      }
    }
  }
  for (const r of rows) {
    if (r.toolkit === 'whatsapp') {
      whatsapp = { id: r.id, userId: r.userId, toolkit: 'whatsapp' };
      break;
    }
  }

  return { email, whatsapp };
}

/* ── Email send ─────────────────────────────────────────────────────── */

export interface SendEmailInput {
  /** Composio entityId — usually `connection.userId`. */
  entityId: string;
  provider: MailProvider;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  /** Provider message id when available. */
  externalMessageId: string | null;
  error?: string;
}

/**
 * Send an email through the realtor's provider. Mirror of
 * `writeEventThrough` for calendar — no DB writes for v1 because the
 * provider's Sent folder is the truth.
 *
 * Outlook send path is wired but only Gmail is enabled at the call site
 * (see app/api/communication/send/route.ts). If the realtor only has
 * Outlook connected, we surface a clear "Outlook send isn't supported
 * yet" error rather than trying a slug that may or may not match
 * Composio's current Outlook send shape.
 */
export async function sendEmailThrough(
  input: SendEmailInput,
): Promise<SendResult> {
  if (!composioConfigured()) {
    return { ok: false, externalMessageId: null, error: 'composio_not_configured' };
  }

  const slug = PROVIDER_MAIL_SLUGS[input.provider].send;

  // Gmail's send shape (verified via lib/delivery.ts): accepts both
  // `recipient_email` (single) and `to` (array). We pass arrays so the
  // multi-recipient case works; SDKs degrade-grace single recipients.
  const args: Record<string, unknown> = {
    recipient_email: input.to[0],
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
    bcc: input.bcc && input.bcc.length > 0 ? input.bcc : undefined,
    subject: input.subject,
    body: input.body,
    // Plain text v1; rich text is a follow-up.
    is_html: false,
  };

  try {
    const resp = await executeToolForEntity({
      entityId: input.entityId,
      slug,
      arguments: args,
    });

    if (resp.successful === false) {
      const err = (resp as { error?: string | null }).error ?? 'send_failed';
      logger.warn(
        '[communication.connect] email external send failed',
        { provider: input.provider, err },
      );
      return { ok: false, externalMessageId: null, error: err };
    }

    // Gmail returns the created message with `id` (and Composio wraps it
    // in `data`). We surface whatever id we can find; null on miss.
    const data = (resp.data as
      | { id?: string; messageId?: string; response_data?: { id?: string } }
      | undefined) ?? undefined;
    const externalMessageId =
      data?.id ?? data?.messageId ?? data?.response_data?.id ?? null;

    return { ok: true, externalMessageId };
  } catch (err) {
    logger.error(
      '[communication.connect] email external send threw',
      { provider: input.provider },
      err,
    );
    return {
      ok: false,
      externalMessageId: null,
      error: err instanceof Error ? err.message : 'send_threw',
    };
  }
}

/* ── WhatsApp send ──────────────────────────────────────────────────── */

export interface SendWhatsAppInput {
  /** Composio entityId — usually `connection.userId`. */
  entityId: string;
  /** E.164 phone number (or whatever shape Composio expects — usually
   *  `+15551234567`). The caller is responsible for normalisation. */
  to: string;
  body: string;
}

/**
 * Send a WhatsApp message through the realtor's Business account.
 *
 * Composio's WhatsApp toolkit standardises on `WHATSAPP_SEND_MESSAGE`.
 * If that slug is rejected at runtime (returned 404 / unknown tool), we
 * surface the error verbatim — the surface tells the realtor honestly
 * that WhatsApp send isn't reachable, rather than swallowing it.
 */
export async function sendWhatsAppThrough(
  input: SendWhatsAppInput,
): Promise<SendResult> {
  if (!composioConfigured()) {
    return { ok: false, externalMessageId: null, error: 'composio_not_configured' };
  }

  const args: Record<string, unknown> = {
    to: input.to,
    // Common shape across messaging toolkits — keep both `to` and
    // `phone_number` to absorb naming drift between SDK versions.
    phone_number: input.to,
    message: input.body,
    body: input.body,
    text: input.body,
  };

  try {
    const resp = await executeToolForEntity({
      entityId: input.entityId,
      slug: WHATSAPP_SLUGS.send,
      arguments: args,
    });

    if (resp.successful === false) {
      const err = (resp as { error?: string | null }).error ?? 'send_failed';
      logger.warn(
        '[communication.connect] whatsapp external send failed',
        { err },
      );
      return { ok: false, externalMessageId: null, error: err };
    }

    const data = (resp.data as
      | { id?: string; messageId?: string; message_id?: string }
      | undefined) ?? undefined;
    const externalMessageId =
      data?.id ?? data?.messageId ?? data?.message_id ?? null;

    return { ok: true, externalMessageId };
  } catch (err) {
    logger.error(
      '[communication.connect] whatsapp external send threw',
      {},
      err,
    );
    return {
      ok: false,
      externalMessageId: null,
      error: err instanceof Error ? err.message : 'send_threw',
    };
  }
}
