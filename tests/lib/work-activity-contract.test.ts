import { describe, expect, it } from 'vitest';
import {
  boundedWorkActivityLabel,
  createWorkActivityId,
} from '@/lib/ai-tools/sdk-chat-stream';

describe('Work activity contract', () => {
  it('derives an opaque stable id from the persisted turn seed', () => {
    const first = createWorkActivityId('chat:message_123');
    expect(first).toBe(createWorkActivityId('chat:message_123'));
    expect(first).not.toBe(createWorkActivityId('chat:message_124'));
    expect(first).toMatch(/^work_[a-f0-9]{24}$/);
    expect(first).not.toContain('message_123');
  });

  it('normalizes whitespace and caps server-authored labels', () => {
    expect(boundedWorkActivityLabel('  Running\n browser_task  ')).toBe(
      'Running browser_task',
    );
    const bounded = boundedWorkActivityLabel('x'.repeat(300));
    expect(bounded).toHaveLength(160);
    expect(bounded.endsWith('…')).toBe(true);
  });
});
