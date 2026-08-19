import { describe, expect, it } from 'vitest';
import { resolveApprovalDisplayArgs } from '@/lib/ai-tools/permission-enrich';

describe('resolveApprovalDisplayArgs', () => {
  it('fills deal and stage names for a move without changing ids', async () => {
    const args = await resolveApprovalDisplayArgs(
      'move_deal_stage',
      { dealId: 'deal_1', stageId: 'stage_1' },
      {
        dealTitle: async (id) => (id === 'deal_1' ? 'Oak Street' : null),
        stageName: async (id) => (id === 'stage_1' ? 'Under contract' : null),
      },
    );
    expect(args).toEqual({
      dealId: 'deal_1',
      stageId: 'stage_1',
      dealTitle: 'Oak Street',
      stageName: 'Under contract',
    });
  });

  it('keeps existing human labels and survives lookup failure', async () => {
    const args = await resolveApprovalDisplayArgs(
      'set_followup',
      { personId: 'p1', when: 'Friday', personName: 'Sam' },
      {
        personName: async () => {
          throw new Error('db down');
        },
      },
    );
    expect(args.personName).toBe('Sam');
    expect(args.when).toBe('Friday');
  });
});
