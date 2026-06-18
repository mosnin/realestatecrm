/**
 * `draft_email` — compose-only. "What would you say."
 *
 * Read-only by design: NO AgentDraft row, NO send, NO persistence. Reuses
 * the exported `composeQuickDraft` from `lib/agent/quick-draft` (shared
 * with the /api/agent/quick-draft route) so we don't duplicate the OpenAI
 * prompt + voice-sample logic.
 *
 * Approval: NO. The realtor isn't sending anything; they're seeing a draft.
 *
 * Rendering: returns `display: 'message-draft'` so the chat shows the draft
 * as a MessageDraft card with Send / Cancel. Because this tool writes NO
 * AgentDraft row (compose-only), there's no draftId — the card's Send/Cancel
 * round-trip through the chat as an explicit instruction (the agent then
 * fires the real send via send_email, which is approval-gated). The data also
 * keeps `subject` + `body` so non-card consumers still work.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';
import { composeQuickDraft } from '@/lib/agent/quick-draft';

const INTENTS = ['check-in', 'log-call', 'welcome', 'reach-out'] as const;

const parameters = z
  .object({
    personId: z.string().min(1).describe('Contact.id to draft for.'),
    intent: z.enum(INTENTS).describe('What angle the draft should take.'),
    contextNote: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe('Free-text hint surfaced into the prompt context. Optional.'),
  })
  .describe('Compose an email draft for a contact. Returns subject + body. No send.');

interface DraftEmailResult {
  subject: string;
  body: string;
  /** Recipient address(es) for the MessageDraft card. */
  to: string[];
  /** Contact display name, for the round-trip instruction. */
  contactName?: string;
}

export const draftEmailTool = defineTool<typeof parameters, DraftEmailResult>({
  name: 'draft_email',
  riskLevel: 'safe',
  description:
    'Compose an email draft for a contact (no send, no persistence). Returns subject and body.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    const composed = await composeQuickDraft({
      kind: 'person',
      id: args.personId,
      intent: args.intent,
      channel: 'email',
      spaceId: ctx.space.id,
    });
    if (!composed) {
      return {
        summary: 'Could not compose a draft (contact missing or compose failed).',
        display: 'error',
      };
    }
    const subject = composed.subject ?? 'Quick check-in';

    // Pull the recipient's name + email so the MessageDraft card has a real
    // "To" line. Best-effort: a missing email still renders (the card shows a
    // placeholder and the round-trip names the contact).
    const { data: contact } = await supabase
      .from('Contact')
      .select('name, email')
      .eq('id', args.personId)
      .eq('spaceId', ctx.space.id)
      .maybeSingle();
    const contactName = contact?.name ?? undefined;
    const to = contact?.email ? [contact.email] : [];

    return {
      summary: `Draft email to ${contactName ?? 'the contact'} — "${subject}"`,
      data: {
        id: `draft-${args.personId}`,
        subject,
        body: composed.body,
        to,
        contactName,
      },
      display: 'message-draft',
    };
  },
});
