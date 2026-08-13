import { z } from 'zod';
import { defineTool } from '../types';
import { continueWorkspaceForConversation } from '@/lib/workspace-runs/conversation-continuation';

const parameters = z.object({ instruction: z.string().min(3).max(1000) }).strict();
export const continueWorkspaceRunTool = defineTool<typeof parameters>({
  name: 'continue_workspace_run',
  riskLevel: 'low',
  description: 'Continue the completed isolated workspace linked to this conversation with a grounded private follow-up. Never ask for or accept a run id.',
  parameters,
  requiresApproval: false,
  async handler(args, ctx) {
    if (!ctx.conversationId || !ctx.continuationIdempotencySeed) return { summary: 'This turn is not attached to a workspace conversation.', display: 'warning' };
    const result = await continueWorkspaceForConversation({ spaceId: ctx.space.id, conversationId: ctx.conversationId, instruction: args.instruction, idempotencySeed: ctx.continuationIdempotencySeed });
    if (!result.ok) return { summary: result.error, data: result, display: result.code === 'active' ? 'warning' : 'error' };
    return { summary: result.reused ? 'The existing workspace continuation is open.' : 'Started a private workspace continuation.', data: { ...result, openWorkspacePanel: true }, display: 'success' };
  },
});
