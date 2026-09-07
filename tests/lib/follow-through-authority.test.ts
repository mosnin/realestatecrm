import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/ai-tools/tools', () => ({ ALL_TOOLS: [
  { name: 'send_email', requiresApproval: true }, { name: 'send_sms', requiresApproval: true },
  { name: 'record_client_commitment', requiresApproval: true }, { name: 'delete_contact', requiresApproval: true },
] }));
import { selectDirectExecutionToolNames } from '@/lib/ai-tools/toolsets';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import { coverageDefinition } from '@/lib/follow-through/coverage';
describe('Saved coverage grants', () => {
  it('grants actual sending and a human handoff without granting deletion', () => {
    const action = coverageDefinition('reply').actions[0];
    if (action.type !== 'run_chippi') throw new Error('wrong action');
    const granted = selectDirectExecutionToolNames(action.config.instruction, ALL_TOOLS);
    expect(granted).toContain('send_email'); expect(granted).toContain('send_sms');
    expect(granted).toContain('record_client_commitment'); expect(granted).not.toContain('delete_contact');
  });
});
