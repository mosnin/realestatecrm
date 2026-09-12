import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), create: vi.fn(), change: vi.fn(), join: vi.fn(), list:vi.fn(), members:vi.fn(), attention:vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/workforce/scope', () => ({ resolveWorkforceScope: mocks.resolve, listWorkforceScopes: async () => [] }));
vi.mock('@/lib/teams/server', () => ({ teamUser: async () => ({ id: 'internal-user' }), listTeams:mocks.list, createTeam: mocks.create, changeTeamMember: mocks.change, joinTeam: mocks.join, inviteTeam: vi.fn(), teamMembers:mocks.members }));
vi.mock('@/lib/teams/work-items',()=>({teamWorkAttention:mocks.attention}));
import { GET,POST } from '@/app/api/teams/route';
const request = (body: unknown) => new Request('https://app.example/api/teams', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('CHIPPI_WORKFORCE_ENABLED', 'true'); mocks.auth.mockResolvedValue({ userId: 'clerk-user' }); mocks.resolve.mockResolvedValue({}); mocks.list.mockResolvedValue([]); });
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

it('rechecks sponsor authority before reading or changing team membership',async()=>{
 mocks.resolve.mockRejectedValue(new Error('Sponsor unavailable'));
 expect((await GET(new Request('https://app.example/api/teams?teamId=team-a'))).status).toBe(403);
 expect((await POST(request({action:'member',teamId:'team-a',userId:'person',role:'admin'}))).status).toBe(403);
 expect(mocks.members).not.toHaveBeenCalled();expect(mocks.change).not.toHaveBeenCalled();
});
it('omits inaccessible teams and attaches attention only to currently authorized teams',async()=>{
 vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');mocks.list.mockResolvedValue([{id:'team-a'},{id:'revoked'}]);
 mocks.resolve.mockImplementation(async(_kind,id)=>{if(id==='revoked')throw new Error('Unavailable');return {};});
 mocks.attention.mockResolvedValue({overdue:3,manager:true});
 const response=await GET(new Request('https://app.example/api/teams'));
 expect(response.headers.get('cache-control')).toBe('no-store');expect((await response.json()).teams).toEqual([{id:'team-a',attention:{overdue:3,manager:true}}]);
 expect(mocks.attention).toHaveBeenCalledOnce();expect(mocks.attention).toHaveBeenCalledWith('team-a','internal-user');
});
it('keeps an unavailable work counter distinct from zero',async()=>{
 vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');mocks.list.mockResolvedValue([{id:'team-a'}]);mocks.attention.mockRejectedValue(new Error('Outage'));
 expect((await (await GET(new Request('https://app.example/api/teams'))).json()).teams).toEqual([{id:'team-a',attention:null}]);
});
