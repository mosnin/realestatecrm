import 'server-only';
/**
 * The one WRITE a work session is allowed: staging a message draft.
 *
 * v2 sessions produce work product, not just reports — but the trust ladder
 * holds: this tool creates a PENDING AgentDraft row (the same drafts inbox
 * the realtor already reviews every morning). Nothing is sent; the draft
 * waits for the realtor's approve/dismiss exactly like every other draft.
 * That's why requiresApproval is false — the approval IS the draft inbox.
 *
 * Session-scoped (built per run with the session id in closure) rather than
 * registered in ALL_TOOLS: chat has its own richer draft paths; this tool
 * exists only inside the background engine, and tags each draft's reasoning
 * with the session so the inbox shows where it came from.
 */

import crypto from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '@/lib/ai-tools/types';
import type { ToolDefinition } from '@/lib/ai-tools/types';

const parameters = z
  .object({
    personId: z.string().min(1).optional().describe('Contact.id the draft is for (from find_person). Omit only for a general note.'),
    channel: z.enum(['sms', 'email']).describe('How the message would go out.'),
    subject: z.string().max(200).optional().describe('Email subject (email only).'),
    body: z.string().min(10).max(5000).describe('The full message, ready to send, in the realtor\'s voice.'),
    reasoning: z.string().max(500).optional().describe('One line on why this draft, shown in the drafts inbox.'),
  })
  .describe('Stage a message draft in the drafts inbox for the realtor to approve. Never sends.');

interface StageDraftResult {
  draftId: string;
}

export function makeStageDraftTool(sessionId: string, sessionGoal: string): ToolDefinition {
  return defineTool<typeof parameters, StageDraftResult>({
    name: 'stage_message_draft',
    riskLevel: 'low',
    description:
      'Stage a ready-to-send message draft in the drafts inbox. It is NOT sent — the realtor approves or dismisses it there. Use for every follow-up/outreach the goal calls for.',
    parameters,
    requiresApproval: false,

    async handler(args, ctx) {
      // Contact must belong to this space when provided.
      let contactId: string | null = null;
      if (args.personId) {
        const { data: contact } = await supabase
          .from('Contact')
          .select('id')
          .eq('id', args.personId)
          .eq('spaceId', ctx.space.id)
          .maybeSingle();
        if (!contact) {
          return { summary: `No contact "${args.personId}" in this workspace — draft not staged.`, display: 'error' };
        }
        contactId = args.personId;
      }

      const draftId = crypto.randomUUID();
      const { error } = await supabase.from('AgentDraft').insert({
        id: draftId,
        spaceId: ctx.space.id,
        contactId,
        channel: args.channel,
        subject: args.channel === 'email' ? (args.subject ?? null) : null,
        content: args.body,
        reasoning: `Work session: ${sessionGoal.slice(0, 160)}${args.reasoning ? ` — ${args.reasoning}` : ''}`,
      });
      if (error) {
        return { summary: `Couldn't stage the draft: ${error.message}`, display: 'error' };
      }

      // Bump the session's draft counter. Read-then-write is racy in theory,
      // but session steps run strictly sequentially, so there's a single
      // writer — and the count is display-only (the drafts inbox is truth).
      const { data: row } = await supabase
        .from('WorkSession')
        .select('draftCount')
        .eq('id', sessionId)
        .maybeSingle();
      const nextCount = ((row as { draftCount?: number } | null)?.draftCount ?? 0) + 1;
      await supabase.from('WorkSession').update({ draftCount: nextCount }).eq('id', sessionId);

      return {
        summary: `Draft staged (${args.channel}) — waiting in the drafts inbox for approval.`,
        display: 'success',
        data: { draftId },
      };
    },
  }) as ToolDefinition;
}
