/**
 * `send_email` — the first mutating tool. Composes + sends an email to a
 * contact via the existing lib/email `sendEmailFromCRM` helper.
 *
 * Approval-gated: the loop will emit `permission_required` for every call,
 * and `continueTurn` runs the handler only after the user approves.
 *
 * Design decisions:
 * - Addresses must resolve to a Contact in the caller's space. The tool
 *   looks up either by contactId (preferred — deterministic) or by email
 *   address (falls back to "known contact" if one exists, else treats the
 *   address as an off-platform recipient and lets the user confirm).
 * - Either `contactId` or `toEmail` is required; the tool refuses with a
 *   helpful error if both are missing.
 * - Body is plain text (rendered as paragraphs in the Resend template).
 *   HTML is explicitly out of scope — the model is not a safe HTML
 *   author for a first mutating tool.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { sendEmailFromCRM } from '@/lib/email';
import { logger } from '@/lib/logger';
import { defineTool } from '../types';

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
  })
  .refine((v) => v.contactId || v.toEmail, {
    message: 'Either contactId or toEmail is required.',
  })
  .describe(
    'Send an email to a contact (or a free-form address). Always prompts the user for approval before sending.',
  );

interface SendEmailResult {
  deliveredTo: string;
  contactId: string | null;
  subject: string;
}

export const sendEmailTool = defineTool<typeof parameters, SendEmailResult>({
  name: 'send_email',
  description:
    'Send an email to a contact. Always prompts the user before sending. Use for follow-ups, tour confirmations, and check-ins.',
  parameters,
  requiresApproval: true,

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

    // Workspace's display name (on envelope) and default reply-to.
    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('businessName, realtorName')
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    const fromName =
      (settings?.businessName as string | undefined) ||
      (settings?.realtorName as string | undefined) ||
      ctx.space.name;

    try {
      await sendEmailFromCRM({
        toEmail: resolvedEmail,
        fromName,
        subject: args.subject,
        body: args.body,
        replyTo: args.replyTo,
      });
    } catch (err) {
      logger.error(
        '[tools.send_email] delivery failed',
        { spaceId: ctx.space.id, to: resolvedEmail },
        err,
      );
      return {
        summary: `Send failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        display: 'error',
      };
    }

    // Best-effort log of the send as a ContactActivity for the audit trail.
    // Non-fatal — the email went out regardless.
    if (resolvedContactId) {
      await supabase
        .from('ContactActivity')
        .insert({
          id: crypto.randomUUID(),
          spaceId: ctx.space.id,
          contactId: resolvedContactId,
          type: 'email',
          content: `AI-assisted: ${args.subject}`,
          metadata: { via: 'on_demand_agent' },
        })
        .catch(() => undefined);
    }

    return {
      summary: `Email sent to ${resolvedEmail} — "${args.subject}".`,
      data: {
        deliveredTo: resolvedEmail,
        contactId: resolvedContactId,
        subject: args.subject,
      },
      display: 'success',
    };
  },
});
