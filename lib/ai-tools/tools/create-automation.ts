/** Create and enable a persisted workflow from the realtor's description. */

import { z } from 'zod';
import {
  createWorkflowFromDescription,
  MAX_AUTOMATION_DESCRIPTION,
  WorkflowCreationError,
} from '@/lib/workflows/create-from-description';
import { defineTool } from '../types';

const parameters = z
  .object({
    description: z
      .string()
      .trim()
      .min(1)
      .max(MAX_AUTOMATION_DESCRIPTION)
      .describe(
        'Exactly what should trigger the automation and what it should do. Preserve explicit send versus draft wording.',
      ),
  })
  .describe('Create and enable a standing CRM workflow from a plain-English instruction.');

interface CreateAutomationResult {
  workflowId: string;
  name: string;
  trigger: string;
  actionCount: number;
  autonomy: 'auto';
  enabled: true;
}

export const createAutomationTool = defineTool<typeof parameters, CreateAutomationResult>({
  name: 'create_automation',
  riskLevel: 'low',
  description:
    'Actually create and enable a standing CRM workflow. Explicit send/email/text instructions become executable auto actions, while explicit draft instructions remain draft actions. Returns the persisted workflow receipt.',
  parameters,
  requiresApproval: true,
  rateLimit: { max: 10, windowSeconds: 3600 },
  summariseCall: (args) => `Create and enable automation: ${args.description.slice(0, 160)}`,

  async handler(args, ctx) {
    try {
      const { workflow, definition } = await createWorkflowFromDescription({
        spaceId: ctx.space.id,
        description: args.description,
        signal: ctx.signal,
      });
      return {
        summary:
          `Created and enabled automation "${workflow.name}" with ${definition.actions.length} ` +
          `action${definition.actions.length === 1 ? '' : 's'} in auto mode.`,
        modelContext: JSON.stringify({
          persisted: true,
          name: workflow.name,
          trigger: definition.trigger.type,
          actionTypes: definition.actions.map((action) => action.type),
          autonomy: definition.autonomy,
          enabled: workflow.enabled,
        }),
        data: {
          workflowId: workflow.id,
          name: workflow.name,
          trigger: definition.trigger.type,
          actionCount: definition.actions.length,
          autonomy: 'auto',
          enabled: true,
        },
        display: 'success',
      };
    } catch (error) {
      const summary =
        error instanceof WorkflowCreationError
          ? error.message
          : `Automation creation failed: ${error instanceof Error ? error.message : 'unknown error'}`;
      return { summary, display: 'error' };
    }
  },
});
