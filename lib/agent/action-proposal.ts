import { z } from 'zod';

export const ACTION_PROPOSAL_KINDS = [
  'integration_action',
  'crm_mutation',
  'external_message',
  'team_message',
  'calendar_action',
  'sandbox_job',
  'child_task',
] as const;

export const ACTION_PROPOSAL_RISKS = ['low', 'high', 'destructive'] as const;

/**
 * The only output unattended work may produce when it wants a side effect.
 * Execution is a separate, user-bound transition; this object is never an
 * instruction to execute merely because a model emitted it.
 */
export const agentActionProposalSchema = z.object({
  version: z.literal(1),
  kind: z.enum(ACTION_PROPOSAL_KINDS),
  action: z.string().trim().min(1).max(160),
  arguments: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().trim().min(1).max(2_000),
  risk: z.enum(ACTION_PROPOSAL_RISKS),
  expectedEffect: z.string().trim().min(1).max(1_000),
  reversible: z.boolean(),
  dedupeKey: z.string().trim().min(1).max(240),
});

export type AgentActionProposalInput = z.infer<typeof agentActionProposalSchema>;

export function parseAgentActionProposal(input: unknown): AgentActionProposalInput {
  return agentActionProposalSchema.parse(input);
}
