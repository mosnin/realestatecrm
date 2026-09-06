import { beforeEach, describe, expect, it, vi } from 'vitest';
const { upsert, tenant } = vi.hoisted(() => ({
  upsert: vi.fn(),
  tenant: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/tenant-db', () => ({ tenantTable: tenant }));
import { persistBackgroundDraft } from '@/lib/agent/persist-background-draft';
import type { ToolContext, ToolResult } from '@/lib/ai-tools/types';
const ctx: ToolContext = {
  userId: 'owner',
  space: { id: 'space', slug: 'oak', name: 'Oak', ownerId: 'owner' },
  signal: new AbortController().signal,
  backgroundRun: true,
};
const draft: ToolResult = {
  display: 'message-draft',
  summary: 'Email composed',
  data: { subject: 'Your next move', body: 'What would be useful this week?' },
};
beforeEach(() => {
  vi.clearAllMocks();
  tenant.mockReturnValue({ upsert });
  upsert.mockResolvedValue({ error: null });
});
describe('Unattended draft receipts', () => {
  it('saves a tenant-scoped pending record using the tool call identity', async () => {
    const result = await persistBackgroundDraft(
      'draft_email',
      { personId: 'person' },
      draft,
      ctx,
      'call-1',
    );
    expect(tenant).toHaveBeenCalledWith(expect.anything(), 'AgentDraft', {
      spaceId: 'space',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'background-draft:space:call-1',
        spaceId: 'space',
        contactId: 'person',
        status: 'pending',
        content: 'What would be useful this week?',
      }),
      { onConflict: 'id', ignoreDuplicates: true },
    );
    expect(result.display).toBe('message-draft');
  });
  it('reports failed persistence and leaves interactive drafts inline', async () => {
    upsert.mockResolvedValue({ error: { message: 'database unavailable' } });
    expect(
      (
        await persistBackgroundDraft(
          'draft_email',
          { personId: 'person' },
          draft,
          ctx,
        )
      ).display,
    ).toBe('error');
    upsert.mockClear();
    expect(
      await persistBackgroundDraft(
        'draft_email',
        { personId: 'person' },
        draft,
        { ...ctx, backgroundRun: false },
      ),
    ).toBe(draft);
    expect(upsert).not.toHaveBeenCalled();
  });
});
