import { describe, expect, it } from 'vitest';
import { isSubagentTool } from '@/components/ai/blocks/subagent-block-view';

describe('specialist row', () => {
  it('treats waiting delegate_task as a specialist, not a raw tool dump', () => {
    expect(isSubagentTool('delegate_task')).toBe(true);
    expect(isSubagentTool('find_person')).toBe(false);
  });
});
