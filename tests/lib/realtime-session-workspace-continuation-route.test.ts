import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireSpaceOwner: vi.fn(), rate: vi.fn(), from: vi.fn(), eligible: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: mocks.requireSpaceOwner }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/realtime/voice-feature', () => ({ realtimeVoiceGatewayEnabled: () => true, realtimeVoiceGatewayReady: () => true }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/workspace-runs/conversation-continuation', () => ({ isConversationWorkspaceContinuationEligible: mocks.eligible }));

import { POST } from '@/app/api/ai/realtime-session/route';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; delete process.env.OPENAI_API_KEY; });
describe('Realtime session Workspace continuation capability', () => {
  beforeEach(() => {
    vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'test-key';
    mocks.requireSpaceOwner.mockResolvedValue({ userId: 'user-1', space: { id: 'space-1', name: 'Test space' } });
    mocks.rate.mockResolvedValue({ allowed: true });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { id: 'conversation-1', spaceId: 'space-1', title: 'Seller review' }, error: null });
    mocks.from.mockReturnValue(query);
    global.fetch = vi.fn(async () => new Response('v=0\r\n', { status: 200, headers: { Location: '/v1/realtime/calls/call-1' } })) as typeof fetch;
  });
  async function sessionFor(eligible: boolean | Error) {
    mocks.eligible.mockImplementation(async () => { if (eligible instanceof Error) throw eligible; return eligible; });
    const response = await POST(new Request('http://localhost/api/ai/realtime-session?slug=test&conversationId=conversation-1', { method: 'POST', body: 'v=0\r\n' }));
    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    const config = JSON.parse((init.body as FormData).get('session') as string);
    return { response, config };
  }
  it('verifies the tenant conversation and includes continuation only when eligible', async () => {
    const { response, config } = await sessionFor(true);
    expect(response.status).toBe(200);
    expect(mocks.eligible).toHaveBeenCalledWith('space-1', 'conversation-1');
    expect(config.tools.map((tool: { name: string }) => tool.name)).toEqual(['start_work_session', 'continue_workspace_run']);
  });
  it('keeps legacy voice available when eligibility throws', async () => {
    const { response, config } = await sessionFor(new Error('temporary read failure'));
    expect(response.status).toBe(200);
    expect(config.tools.map((tool: { name: string }) => tool.name)).toEqual(['start_work_session']);
  });
});
