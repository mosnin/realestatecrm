/**
 * `send_email` — compose + send an email after realtor approval.
 *
 * Delivery (no attachments): `sendDraft` so a connected Gmail/Outlook wins.
 * Attachments still ride the platform Resend sender (inbox actions don't
 * take files yet) and the result says so.
 *
 * Compliance runs before delivery. A block is "Blocked because X", never a
 * fake send. A failed send is "Send failed: …", never success.
 *
 * Approval-gated: the loop emits `permission_required` and `continueTurn`
 * runs the handler only after the user approves.
 *
 * Addresses must resolve to a Contact in the caller's space (contactId) or
 * a free-form toEmail. Body is plain text.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import {
  sendEmailFromCRM,
  ComplianceBlockedError,
  EmailSendError,
  type SendEmailAttachment,
} from '@/lib/email';
import { describeDelivery, sendDraft, type DeliveryResult } from '@/lib/delivery';
import { checkSendAllowed } from '@/lib/messaging/compliance';
import { recordOutboundMessageSafe } from '@/lib/inbox';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';
import { makeIdempotencyKey, withIdempotency } from '@/lib/agent/ts-idempotency';
import { getSignedDownloadUrl } from '@/lib/storage';

/** Max combined size of all attachments per email. Resend accepts up to
 *  40 MB across all attachments; we cap below that for headroom. */
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const parameters = z
  .object({
    contactId: z
      .string()
      .min(1)
      .optional()
      .describe('Contact.id to send to. Prefer this over toEmail when the contact is in the workspace.'),
    toEmail: z
      .string()
      .email()
      .optional()
      .describe('Recipient email. Use when the recipient isn\'t a saved contact.'),
    subject: z
      .string()
      .min(1)
      .max(200)
      .describe('Subject line. Required.'),
    body: z
      .string()
      .min(1)
      .max(5000)
      .describe('Plain-text body. Paragraphs separated by blank lines. No HTML — the tool wraps it in a safe template.'),
    replyTo: z
      .string()
      .email()
      .optional()
      .describe('Optional reply-to address, falling back to the workspace default.'),
    attachmentFileIds: z
      .array(z.string().min(1))
      .max(10)
      .optional()
      .describe(
        'Optional File.id list to attach to the email. Resolve filenames via list_files first; reads each from storage at send time. Max 10 files / 25 MB combined.',
      ),
  })
  .refine((v) => v.contactId || v.toEmail, {
    message: 'Either contactId or toEmail is required.',
  })
  .describe(
    'Send an email to a contact (or a free-form address). Always prompts the user for approval before sending. Pass attachmentFileIds to include uploaded files.',
  );

interface SendEmailResult {
  deliveredTo: string;
  contactId: string | null;
  subject: string;
  method?: DeliveryResult['method'];
  fallback?: boolean;
}

function blockedBecause(reason?: string, detail?: string): string {
  const why =
    reason === 'suppressed'
      ? 'the recipient opted out'
      : reason === 'no_consent'
        ? 'no consent on file'
        : reason === 'quiet_hours'
          ? 'quiet hours'
          : reason === 'invalid_address'
            ? 'the address is not usable'
            : reason === 'lookup_failed'
              ? 'messaging rules could not be verified'
              : reason ?? 'messaging rules';
  return `Blocked because ${why}: ${detail ?? 'this message was not sent.'}`;
}

export const sendEmailTool = defineTool<typeof parameters, SendEmailResult>({
  name: 'send_email',
  riskLevel: 'high',
  description:
    'Send an email to a person. Always prompts the user before sending. Use for follow-ups, tour confirmations, and check-ins.',
  parameters,
  requiresApproval: true,
  // 50 sends/hour/user caps accidental mass-blasts without throttling
  // realistic follow-up sessions.
  rateLimit: { max: 50, windowSeconds: 3600 },
  summariseCall(args) {
    const to = args.toEmail ?? (args.contactId ? `contact ${args.contactId.slice(0, 8)}` : 'a contact');
    return `Email ${to} — "${args.subject}"`;
  },

  async handler(args, ctx) {
    // Resolve the recipient. Three cases, in order of preference:
    //   1. contactId provided → look it up, use that contact's email.
    //   2. toEmail provided, matches a contact in this space → use that.
    //   3. toEmail provided, no matching contact → send to the bare address.
    let resolvedEmail: string | null = null;
    let resolvedContactId: string | null = null;

    if (args.contactId) {
      const { data: contact, error } = await supabase
        .from('Contact')
        .select('id, email, name')
        .eq('id', args.contactId)
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .maybeSingle();
      if (error) {
        return { summary: `Contact lookup failed: ${error.message}`, display: 'error' };
      }
      if (!contact) {
        return {
          summary: `No contact with id "${args.contactId}" in this workspace.`,
          display: 'error',
        };
      }
      if (!contact.email) {
        return {
          summary: `${contact.name} has no email on file — add one before sending.`,
          display: 'error',
        };
      }
      resolvedContactId = contact.id;
      resolvedEmail = contact.email;
    } else if (args.toEmail) {
      resolvedEmail = args.toEmail;
      // Best-effort contact lookup so the tool result carries the link.
      const { data: maybeContact } = await supabase
        .from('Contact')
        .select('id')
        .eq('spaceId', ctx.space.id)
        .is('brokerageId', null)
        .eq('email', args.toEmail)
        .maybeSingle();
      resolvedContactId = maybeContact?.id ?? null;
    }

    if (!resolvedEmail) {
      return {
        summary: 'Could not resolve a recipient email address.',
        display: 'error',
      };
    }

    // Workspace's display name for the envelope. The fallback chain is
    // strict about what exists: SpaceSetting.businessName (canonical, set
    // on onboarding) → the Space's display name. We intentionally do NOT
    // include User.name here because that's the owner's personal name,
    // which they may not want on every outbound email.
    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('businessName')
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    const fromName =
      (settings?.businessName as string | undefined) || ctx.space.name;

    // Resolve attachments BEFORE the send — fetch each File row in this
    // space, download the bytes via a signed URL, and build the Resend
    // payload. We do this serially because attachment counts are small
    // (≤10) and a parallel fetch storm against Wasabi for a single send
    // isn't worth the complexity.
    let resolvedAttachments: SendEmailAttachment[] | undefined;
    if (args.attachmentFileIds && args.attachmentFileIds.length > 0) {
      const ids = args.attachmentFileIds;
      const { data: rows, error: fileErr } = await supabase
        .from('File')
        .select('id, name, mimeType, sizeBytes, storageKey')
        .in('id', ids)
        .eq('spaceId', ctx.space.id);
      if (fileErr) {
        return { summary: `Attachment lookup failed: ${fileErr.message}`, display: 'error' };
      }
      const found = (rows ?? []) as Array<{
        id: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
        storageKey: string;
      }>;
      const missing = ids.filter((id) => !found.find((r) => r.id === id));
      if (missing.length > 0) {
        return {
          summary: `Attachment ids not found: ${missing.join(', ')}`,
          display: 'error',
        };
      }
      const totalBytes = found.reduce((sum, r) => sum + Number(r.sizeBytes ?? 0), 0);
      if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        return {
          summary: `Attachments exceed ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024)} MB combined limit.`,
          display: 'error',
        };
      }
      try {
        resolvedAttachments = await Promise.all(
          found.map(async (r) => {
            const url = await getSignedDownloadUrl(r.storageKey, 60);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Failed to fetch ${r.name} (${res.status})`);
            const buffer = Buffer.from(await res.arrayBuffer());
            return { filename: r.name, content: buffer, contentType: r.mimeType };
          }),
        );
      } catch (err) {
        return {
          summary: `Failed to download attachment: ${err instanceof Error ? err.message : 'unknown error'}`,
          display: 'error',
        };
      }
    }

    // Interactive idempotency must distinguish genuinely-different messages
    // while collapsing a byte-for-byte retry, so its local key includes a body
    // hash. A durable execution already has an immutable database action id;
    // that server-issued identity must win regardless of message content.
    const durableIdempotencyKey = ctx.executionIdempotencyKey;
    const bodyHash = crypto
      .createHash('sha256')
      .update(args.body.trim())
      .digest('hex');
    // Interactive retries retain their content-derived local key. A leased
    // durable action uses its immutable row-derived key both here and at the
    // provider, so a crash never changes retry identity.
    const idemKey = durableIdempotencyKey ?? makeIdempotencyKey(
      'send_email',
      ctx.space.id,
      resolvedEmail,
      args.subject,
      bodyHash,
    );
    const decision = await checkSendAllowed({
      spaceId: ctx.space.id,
      channel: 'email',
      address: resolvedEmail,
      audience: 'consumer',
      category: 'marketing',
      contactId: resolvedContactId,
    });
    if (!decision.allowed) {
      const summary = blockedBecause(decision.reason, decision.detail);
      logger.warn('[tools.send_email] blocked by compliance', {
        spaceId: ctx.space.id,
        reason: decision.reason,
      });
      if (durableIdempotencyKey) {
        return {
          summary,
          display: 'error',
          durableExecutionDisposition: 'terminal_failure',
        };
      }
      return { summary, display: 'error' };
    }

    const hasAttachments = Boolean(resolvedAttachments && resolvedAttachments.length > 0);
    let delivery: DeliveryResult | null = null;

    try {
      await withIdempotency(idemKey, async () => {
        if (hasAttachments) {
          // Inbox-connect actions don't take files yet. Attachments go
          // through the platform sender and the realtor is told that.
          if (!process.env.RESEND_API_KEY) {
            throw new EmailSendError(
              'Platform sender is not configured, and attachments cannot go through a connected inbox yet.',
              undefined,
              'terminal_failure',
            );
          }
          await sendEmailFromCRM({
            audience: 'consumer',
            category: 'marketing',
            spaceId: ctx.space.id,
            contactId: resolvedContactId,
            toEmail: resolvedEmail!,
            fromName,
            subject: args.subject,
            body: args.body,
            replyTo: args.replyTo,
            attachments: resolvedAttachments,
            idempotencyKey: durableIdempotencyKey,
          });
          delivery = { sent: true, method: 'email' };
          return;
        }

        const result = await sendDraft(
          { channel: 'email', subject: args.subject, content: args.body },
          {
            name: fromName,
            email: resolvedEmail,
            phone: null,
          },
          fromName,
          { spaceId: ctx.space.id, userId: ctx.userId },
        );
        if (!result.sent) {
          const configured = result.error !== 'not_configured';
          throw new EmailSendError(
            result.error ?? 'Delivery failed',
            undefined,
            configured ? 'retryable' : 'terminal_failure',
          );
        }
        delivery = result;
      });
    } catch (err) {
      logger.error(
        '[tools.send_email] delivery failed',
        { spaceId: ctx.space.id, to: resolvedEmail },
        err,
      );
      const blocked = err instanceof ComplianceBlockedError;
      const summary = blocked
        ? blockedBecause(err.reason, err.message)
        : `Send failed: ${err instanceof Error ? err.message : 'unknown error'}`;
      if (durableIdempotencyKey) {
        const disposition = typeof err === 'object' && err && 'durableDisposition' in err
          ? (err as { durableDisposition?: unknown }).durableDisposition
          : 'retryable';
        if (disposition === 'terminal_failure' || disposition === 'reconciliation_required') {
          return {
            summary,
            display: 'error',
            durableExecutionDisposition: disposition,
          };
        }
        throw err;
      }
      return { summary, display: 'error' };
    }

    // Best-effort log of the send as a ContactActivity for the audit trail.
    // Non-fatal — the email went out regardless. PostgREST returns
    // { data, error } rather than throwing on DB errors, so we check the
    // error field explicitly; the surrounding try/catch covers any
    // transport-level exception.
    if (resolvedContactId) {
      try {
        const { error: auditErr } = await supabase.from('ContactActivity').insert({
          id: durableIdempotencyKey
            ? `work-session-email-activity-${crypto.createHash('sha256').update(durableIdempotencyKey).digest('hex').slice(0, 32)}`
            : crypto.randomUUID(),
          spaceId: ctx.space.id,
          contactId: resolvedContactId,
          type: 'email',
          content: `AI-assisted: ${args.subject}`,
          metadata: {
            via: 'on_demand_agent',
            ...(durableIdempotencyKey ? { executionIdempotencyKey: durableIdempotencyKey } : {}),
          },
        });
        if (auditErr) {
          logger.warn(
            '[tools.send_email] audit insert failed',
            { contactId: resolvedContactId },
            auditErr,
          );
        }
      } catch (err) {
        logger.warn('[tools.send_email] audit insert threw', { contactId: resolvedContactId }, err);
      }
    }

    const sent: DeliveryResult = delivery ?? { sent: true, method: 'email' };
    if (resolvedContactId) {
      await recordOutboundMessageSafe(
        {
          spaceId: ctx.space.id,
          contactId: resolvedContactId,
          channel: 'email',
          body: args.body,
          subject: args.subject,
          metadata: {
            source: 'send_email',
            method: sent.method,
            ...(sent.fallback ? { fallback: true } : {}),
            ...(hasAttachments ? { attachments: true } : {}),
          },
        },
        { route: 'tools.send_email', spaceId: ctx.space.id },
      );
    }

    const voice = hasAttachments
      ? "from Chippi's sender (attachments cannot go through a connected inbox yet)"
      : describeDelivery(sent);

    return {
      summary: `Email sent to ${resolvedEmail} — "${args.subject}" ${voice}.`,
      data: {
        deliveredTo: resolvedEmail,
        contactId: resolvedContactId,
        subject: args.subject,
        method: sent.method,
        fallback: sent.fallback,
      },
      display: 'success',
    };
  },
});
