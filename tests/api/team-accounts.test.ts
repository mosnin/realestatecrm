import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), create: vi.fn(), change: vi.fn(), join: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/workforce/scope', () => ({ resolveWorkforceScope: mocks.resolve, listWorkforceScopes: async () => [] }));
vi.mock('@/lib/teams/server', () => ({ teamUser: async () => ({ id: 'internal-user' }), listTeams: async () => [], createTeam: mocks.create, changeTeamMember: mocks.change, joinTeam: mocks.join, inviteTeam: vi.fn(), teamMembers: vi.fn() }));
import { POST } from '@/app/api/teams/route';
const request = (body: unknown) => new Request('https://app.example/api/teams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('CHIPPI_WORKFORCE_ENABLED', 'true'); mocks.auth.mockResolvedValue({ userId: 'clerk-user' }); mocks.resolve.mockResolvedValue({}); });
afterEach(() => vi.unstubAllEnvs());
it('requires authentication', async () => { mocks.auth.mockResolvedValue({ userId: null }); expect((await POST(request({}))).status).toBe(401); });
it('validates the sponsoring account before creating a team', async () => {
  mocks.resolve.mockRejectedValue(new Error('Not entitled'));
  expect((await POST(request({ action: 'create', name: 'Team', parentKind: 'brokerage', parentRouteId: 'broker-a' }))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('uses authenticated internal ownership and never a caller-supplied owner', async () => {
  mocks.create.mockResolvedValue({ id: 'team-a' });
  expect((await POST(request({ action: 'create', name: ' Team ', parentKind: 'personal', parentRouteId: 'my-space', ownerId: 'victim' }))).status).toBe(201);
  expect(mocks.resolve).toHaveBeenCalledWith('personal', 'my-space', 'clerk-user');
  expect(mocks.create).toHaveBeenCalledWith('internal-user', 'Team', 'personal', 'my-space');
});
it('cannot assign an owner role through membership changes', async () => {
  expect((await POST(request({ action: 'member', teamId: 'team-a', userId: 'person', role: 'owner' }))).status).toBe(400);
  expect(mocks.change).not.toHaveBeenCalled();
});
it('rejects arbitrary invitation formats before querying membership', async () => {
  expect((await POST(request({ action: 'join', code: '../../private' }))).status).toBe(400);
  expect(mocks.join).not.toHaveBeenCalled();
});
