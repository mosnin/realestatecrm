/**
 * stage_message_draft — the ONE write a background session may perform.
 * These tests pin the safety contract:
 *   - a personId outside the session's space never stages a draft
 *   - staged drafts are PENDING AgentDraft rows tagged with the session goal
 *   - subject only survives on email drafts
 *   - the WorkSession draftCount bumps after a successful stage
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

let contactRow: { id: string } | null = null;
let insertError: { message: string } | null = null;
let draftCount = 0;
const inserted: Record<string, unknown>[] = [];
const sessionUpdates: Record<string, unknown>[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({
            data: table === 'Contact' ? contactRow : { draftCount },
          }),
        };
        return chain;
      },
      insert: (row: Record<string, unknown>) => {
        inserted.push({ __table: table, ...row });
        return Promise.resolve({ error: insertError });
      },
      update: (patch: Record<string, unknown>) => {
        if (table === 'WorkSession') sessionUpdates.push(patch);
        return { eq: async () => ({}) };
      },
    }),
  },
}));

import { makeStageDraftTool } from '@/lib/work-sessions/draft-tool';
import type { ToolContext } from '@/lib/ai-tools/types';

const ctx = { userId: 'u1', space: { id: 'sp1' } } as unknown as ToolContext;

beforeEach(() => {
  contactRow = { id: 'c1' };
  insertError = null;
  draftCount = 0;
  inserted.length = 0;
  sessionUpdates.length = 0;
});

describe('makeStageDraftTool', () => {
  const tool = makeStageDraftTool('ws1', 'Re-engage quiet hot leads');

  it('is the sanctioned write: no approval gate, low risk, session-scoped name', () => {
    expect(tool.name).toBe('stage_message_draft');
    expect(tool.requiresApproval).toBe(false);
    expect(tool.riskLevel).toBe('low');
  });

  it('refuses a personId that is not in the space, staging nothing', async () => {
    contactRow = null;
    const result = await tool.handler(
      { personId: 'someone-elses-contact', channel: 'sms', body: 'Hi there, checking in!' } as never,
      ctx,
    );
    expect(result.display).toBe('error');
    expect(inserted).toHaveLength(0);
    expect(sessionUpdates).toHaveLength(0);
  });

  it('stages a pending draft tagged with the session goal and bumps draftCount', async () => {
    const result = await tool.handler(
      {
        personId: 'c1',
        channel: 'email',
        subject: 'Checking in',
        body: 'Hi Dana — wanted to circle back on the Maple St listing.',
        reasoning: 'Quiet for 3 weeks',
      } as never,
      ctx,
    );
    expect(result.display).toBe('success');

    const draft = inserted[0];
    expect(draft.__table).toBe('AgentDraft');
    expect(draft.spaceId).toBe('sp1');
    expect(draft.contactId).toBe('c1');
    expect(draft.channel).toBe('email');
    expect(draft.subject).toBe('Checking in');
    expect(String(draft.reasoning)).toContain('Work session: Re-engage quiet hot leads');
    expect(String(draft.reasoning)).toContain('Quiet for 3 weeks');

    expect(sessionUpdates).toEqual([{ draftCount: 1 }]);
  });

  it('drops the subject on sms drafts', async () => {
    await tool.handler(
      { personId: 'c1', channel: 'sms', subject: 'ignored', body: 'Quick check-in about the tour!' } as never,
      ctx,
    );
    expect(inserted[0].subject).toBeNull();
  });

  it('surfaces the insert error without touching the counter', async () => {
    insertError = { message: 'row violates policy' };
    const result = await tool.handler(
      { personId: 'c1', channel: 'sms', body: 'Quick check-in about the tour!' } as never,
      ctx,
    );
    expect(result.display).toBe('error');
    expect(sessionUpdates).toHaveLength(0);
  });
});
