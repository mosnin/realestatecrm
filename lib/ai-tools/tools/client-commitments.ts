import { checkCoverageAction } from '@/lib/follow-through/guard';
import { z } from 'zod';
import { defineTool } from '../types';
import { commitmentSchema, createCommitment, listCommitments, commitmentState } from '@/lib/follow-through/service';

export const recordClientCommitmentTool = defineTool({
  name: 'record_client_commitment', riskLevel: 'high', requiresApproval: true, rateLimit: { max: 60, windowSeconds: 3600 },
  description: 'Record one specific client promise or human handoff with a due date. A channel explicitly schedules an automatic message through the existing dispatcher; null means a human must act. Use a stable UUID for retries. Never mark a queued message completed.',
  parameters: commitmentSchema,
  summariseCall: args => `${args.channel ? 'Send automatically' : 'Record work'}: ${args.title} by ${args.dueAt}`,
  async handler(args, ctx) {
    const coverageError = await checkCoverageAction(ctx, args.contactId);
    if (coverageError || (ctx.followThroughScope && args.channel)) return { summary: coverageError ?? 'This routine can record human work, but cannot start additional automatic messages.', display: 'error' as const };
    try {
      const id = await createCommitment(ctx.space.id, args);
      return { summary: args.channel ? 'Client message scheduled to send automatically.' : 'Client commitment recorded for the workspace owner.', data: { commitmentId: id, state: args.channel ? 'scheduled' : 'open' }, display: 'success' as const };
    } catch (err) { return { summary: err instanceof Error ? err.message : 'Could not record commitment', display: 'error' as const }; }
  },
});
export const listClientCommitmentsTool = defineTool({
  name: 'list_client_commitments', riskLevel: 'low', requiresApproval: false,
  description: 'Read dated client commitments, handoffs and actual message delivery states in this workspace.',
  parameters: z.object({}), summariseCall: () => 'Read client commitments',
  async handler(_args, ctx) {
    try {
      const items = await listCommitments(ctx.space.id);
      return { summary: `${items.length} client commitments.`, data: { commitments: items.map(i => ({ ...i, state: commitmentState(i) })) }, display: 'plain' as const };
    } catch { return { summary: 'Client commitments are unavailable.', display: 'error' as const }; }
  },
});
