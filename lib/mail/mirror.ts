/**
 * Mail through-write helpers — the email analogue of `lib/calendar/mirror.ts`.
 *
 * Same architecture as calendar: Chippi doesn't own the inbox. The realtor
 * lives in Gmail (or Outlook); /s/[slug]/mail mirrors what's there and lets
 * them compose + send directly through their provider via Composio.
 *
 * One seam, one bug surface. The /mail surface, the future "send follow-up"
 * routines, and anything else that wants to send-as-the-realtor route through
 * `sendEmailThrough`. Provider routing lives in one place.
 *
 * No backup table for v1: sent emails live in the provider's Sent folder
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

/** Provider slug as Composio knows it. */
export type MailProvider = 'gmail' | 'outlook';

/** Toolkits we accept for the read path. */
export const MAIL_TOOLKITS = ['gmail', 'outlook'] as const;

/**
 * Composio tool slugs per provider. Verified against
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

export interface MailConnection {
  /** IntegrationConnection row id. */
  id: string;
  /** Composio entityId — the realtor's Clerk userId. */
  userId: string;
  /** Provider slug. */
  toolkit: MailProvider;
}

/**
 * Find the realtor's active mail connection for this space. Returns the
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
      '[mail.mirror] findEmailConnection failed',
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

export interface SendThroughInput {
  /** Composio entityId — usually `connection.userId`. */
  entityId: string;
  provider: MailProvider;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

export interface SendThroughResult {
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
 * (see app/api/mail/send/route.ts). If the realtor only has Outlook
 * connected, we surface a clear "Outlook send isn't supported yet" error
 * rather than trying a slug that may or may not match Composio's current
 * Outlook send shape.
 */
export async function sendEmailThrough(
  input: SendThroughInput,
): Promise<SendThroughResult> {
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
        '[mail.mirror] external send failed',
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
      '[mail.mirror] external send threw',
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
