import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ coordinator: vi.fn(), run: vi.fn(), from: vi.fn(), tenant: vi.fn(), selected: vi.fn(), premium: vi.fn() }));
vi.mock('@/lib/convex/follow-up-pilot', () => ({ callFollowUpCoordinator: mocks.coordinator, usesConvexFollowUp: mocks.selected }));
vi.mock('@/lib/routines', () => ({ fireRoutineRun: mocks.run }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/tenant-db', () => ({ tenantTable: mocks.tenant }));
vi.mock('@/lib/api-auth', () => ({ isPremiumAccessBlocked: mocks.premium }));
import { executeConvexFollowUp } from '@/lib/convex/execute-follow-up';
import { POST } from '@/app/api/internal/convex-follow-up/route';
import { NextRequest } from 'next/server';
const job = { jobId: 'job-1', spaceId: 'space-a', routineId: 'routine-1', scheduledFor: '2026-01-01T00:00:00.000Z' };
let routine: Record<string, unknown>;
function chain(data: unknown) { const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };q.select.mockReturnValue(q);q.eq.mockReturnValue(q);return q; }
beforeEach(() => {
  vi.clearAllMocks();vi.stubEnv('CHIPPI_CALLBACK_SECRET', 'callback-test');vi.stubEnv('CRON_ROUTINES_DISABLED', '');
  routine = { id: job.routineId, instruction: 'Follow up with eligible leads', enabled: true, nextRunAt: job.scheduledFor };
  mocks.selected.mockReturnValue(true);mocks.coordinator.mockResolvedValue(true);mocks.run.mockResolvedValue('ok');mocks.premium.mockReturnValue(false);
  mocks.tenant.mockImplementation(() => chain(routine));
  mocks.from.mockImplementation(table => chain(table === 'Space' ? { ownerId: 'owner', stripeSubscriptionStatus: 'active' } : { clerkId: 'current-owner', platformRole: 'user' }));
});
afterEach(() => vi.unstubAllEnvs());
describe('Supabase execution bridge', () => {
  it('re-reads tenant-scoped instructions and owner before using the canonical executor', async () => {
    expect(await executeConvexFollowUp(job)).toBe('completed');
    expect(mocks.tenant).toHaveBeenCalledWith(expect.anything(), 'Routine', { spaceId: job.spaceId });
    expect(mocks.run).toHaveBeenCalledWith(job.spaceId, routine.instruction, 'current-owner');
  });
  it('never runs a replayed callback', async () => {
    mocks.coordinator.mockResolvedValue(false);
    expect(await executeConvexFollowUp(job)).toBe('duplicate');expect(mocks.run).not.toHaveBeenCalled();expect(mocks.tenant).not.toHaveBeenCalled();
  });
  it.each(['disabled', 'rescheduled', 'missing', 'subscription', 'banned', 'pilot-off'])('refuses execution when %s', async reason => {
    if (reason === 'disabled') routine.enabled = false;
    if (reason === 'rescheduled') routine.nextRunAt = '2026-01-02T00:00:00.000Z';
    if (reason === 'missing') mocks.tenant.mockReturnValue(chain(null));
    if (reason === 'subscription') mocks.premium.mockReturnValue(true);
    if (reason === 'banned') mocks.from.mockImplementation(t => chain(t === 'Space' ? { ownerId: 'owner' } : { clerkId: 'owner', platformRole: 'banned' }));
    if (reason === 'pilot-off') mocks.selected.mockReturnValue(false);
    expect(await executeConvexFollowUp(job)).toBe('skipped');expect(mocks.run).not.toHaveBeenCalled();
  });
  it('rejects forged callback authorization before claiming a job', async () => {
    const res = await POST(new NextRequest('https://chippi.example/api/internal/convex-follow-up', { method: 'POST', body: JSON.stringify(job) }));
    expect(res.status).toBe(401);expect(mocks.coordinator).not.toHaveBeenCalled();
  });
  it('rejects instructions injected into the reference payload', async () => {
    const res = await POST(new NextRequest('https://chippi.example/api/internal/convex-follow-up', { method: 'POST', headers: { authorization: 'Bearer callback-test' }, body: JSON.stringify({ ...job, instruction: 'send anything' }) }));
    expect(res.status).toBe(400);expect(mocks.run).not.toHaveBeenCalled();
  });
  it('reports uncertainty if the response path fails', async () => {
    mocks.run.mockRejectedValue(new Error('Lost receipt'));
    const res = await POST(new NextRequest('https://chippi.example/api/internal/convex-follow-up', { method: 'POST', headers: { authorization: 'Bearer callback-test' }, body: JSON.stringify(job) }));
    expect(res.status).toBe(503);expect(await res.json()).toEqual({ jobId: job.jobId, state: 'uncertain' });
  });
});
