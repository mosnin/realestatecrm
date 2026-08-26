import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  countWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
  validateIntegrationTrigger: vi.fn(),
}));

vi.mock('@/lib/llm', () => ({
  getLLMClient: () => ({ chat: { completions: { create: mocks.complete } } }),
  resolveChatModel: () => 'test-model',
  usageAccountingParams: () => ({}),
}));

vi.mock('@/lib/workflows/store', () => ({
  countWorkflows: mocks.countWorkflows,
  createWorkflow: mocks.createWorkflow,
  MAX_WORKFLOWS_PER_SPACE: 50,
}));

vi.mock('@/lib/integrations/trigger-catalog', () => ({
  validateIntegrationTrigger: mocks.validateIntegrationTrigger,
}));

import {
  createWorkflowFromDescription,
  requestedDelayMinutes,
  WorkflowCreationError,
} from '@/lib/workflows/create-from-description';

function completionFor(action: Record<string, unknown>) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            name: 'New lead follow-up',
            description: 'Contacts every new lead.',
            definition: {
              trigger: { type: 'lead_created', config: {} },
              conditions: { op: 'and', rules: [] },
              actions: [action],
              autonomy: 'draft',
            },
          }),
        },
      },
    ],
  };
}

describe('createWorkflowFromDescription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.countWorkflows.mockResolvedValue(0);
    mocks.validateIntegrationTrigger.mockReturnValue(null);
    mocks.createWorkflow.mockImplementation(async (_spaceId, input) => ({
      id: 'workflow-1',
      name: input.name,
      description: input.description ?? null,
      enabled: input.enabled,
      autonomy: input.definition.autonomy,
    }));
  });

  it('turns an explicit email instruction into an enabled auto send workflow', async () => {
    mocks.complete.mockResolvedValue(
      completionFor({
        type: 'draft_message',
        config: { channel: 'email', instruction: 'Welcome the new lead.' },
      }),
    );

    const result = await createWorkflowFromDescription({
      spaceId: 'space-1',
      description: 'Email every new lead immediately',
    });

    expect(mocks.createWorkflow).toHaveBeenCalledWith(
      'space-1',
      expect.objectContaining({
        enabled: true,
        notifyOnError: true,
        definition: expect.objectContaining({
          autonomy: 'auto',
          actions: [
            expect.objectContaining({
              type: 'schedule_message',
              config: {
                channel: 'email',
                instruction: 'Welcome the new lead.',
                delayMinutes: 0,
              },
            }),
          ],
        }),
      }),
    );
    expect(result.workflow.id).toBe('workflow-1');
    expect(result.definition.autonomy).toBe('auto');
  });

  it('preserves a draft action only when drafting was explicitly requested', async () => {
    mocks.complete.mockResolvedValue(
      completionFor({
        type: 'draft_message',
        config: { channel: 'email', instruction: 'Prepare a welcome note.' },
      }),
    );

    const result = await createWorkflowFromDescription({
      spaceId: 'space-1',
      description: 'Draft an email whenever a new lead arrives',
    });

    expect(result.definition.autonomy).toBe('auto');
    expect(result.definition.actions[0]?.type).toBe('draft_message');
  });

  it('rejects an explicit send if the generated workflow contains no send action', async () => {
    mocks.complete.mockResolvedValue(
      completionFor({
        type: 'create_task',
        config: { title: 'Follow up with new lead', dueInDays: 0 },
      }),
    );

    await expect(
      createWorkflowFromDescription({
        spaceId: 'space-1',
        description: 'Email every new lead immediately',
      }),
    ).rejects.toMatchObject({
      code: 'invalid',
      message: expect.stringContaining('did not contain the requested send action'),
    } satisfies Partial<WorkflowCreationError>);
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });

  it('parses day and week waits for timed follow-ups', () => {
    expect(requestedDelayMinutes('Follow up with every new lead in 2 days')).toBe(2880);
    expect(requestedDelayMinutes('Text them after 1 week')).toBe(10080);
    expect(requestedDelayMinutes('Email every new lead immediately')).toBe(0);
  });

  it('turns a generated delay-plus-draft into a timed send for autonomous follow-ups', async () => {
    mocks.complete.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              name: 'Autonomous follow-up',
              description: 'Follows new leads after two days.',
              definition: {
                trigger: { type: 'lead_created', config: {} },
                conditions: { op: 'and', rules: [] },
                actions: [
                  { type: 'delay', config: { delayMinutes: 2880 } },
                  { type: 'draft_message', config: { channel: 'sms', instruction: 'Check in.' } },
                ],
                autonomy: 'draft',
              },
            }),
          },
        },
      ],
    });

    const result = await createWorkflowFromDescription({
      spaceId: 'space-1',
      description: 'Set up autonomous follow-ups: text every new lead after 2 days',
    });

    expect(result.definition.autonomy).toBe('auto');
    expect(result.definition.actions).toEqual([
      expect.objectContaining({
        type: 'schedule_message',
        config: expect.objectContaining({
          channel: 'sms',
          instruction: 'Check in.',
          delayMinutes: 2880,
        }),
      }),
    ]);
  });

  it('does not mistake an inbound-message trigger for an instruction to send', async () => {
    mocks.complete.mockResolvedValue(
      completionFor({
        type: 'create_task',
        config: { title: 'Review the inbound message', dueInDays: 0 },
      }),
    );

    const result = await createWorkflowFromDescription({
      spaceId: 'space-1',
      description: 'When an inbound message arrives, create a follow-up task',
    });

    expect(result.definition.actions[0]?.type).toBe('create_task');
    expect(mocks.createWorkflow).toHaveBeenCalledOnce();
  });
});
