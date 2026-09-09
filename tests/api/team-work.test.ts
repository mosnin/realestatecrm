import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),resolve:vi.fn(),create:vi.fn(),update:vi.fn(),list:vi.fn(),audit:vi.fn(),rate:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@clerk/nextjs/server',()=>({auth:mocks.auth}));
vi.mock('@/lib/workforce/scope',()=>({resolveWorkforceScope:mocks.resolve}));
vi.mock('@/lib/teams/work-items',async original=>({...await original<object>(),createTeamWork:mocks.create,updateTeamWork:mocks.update,listTeamWork:mocks.list}));
vi.mock('@/lib/rate-limit',()=>({checkRateLimit:mocks.rate}));
vi.mock('@/lib/audit',()=>({audit:mocks.audit}));
import {GET,POST,PATCH} from '@/app/api/teams/[teamId]/work/route';
const ctx={params:Promise.resolve({teamId:'team-a'})};
const body={title:'Confirm inspection time',assignedTo:'agent-a',dueAt:'2026-09-10T12:00:00Z'};
const request=(data:unknown,method='POST')=>new Request('https://app.test/api/teams/team-a/work',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CHIPPI_WORKFORCE_ENABLED','true');vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');mocks.auth.mockResolvedValue({userId:'clerk-a'});mocks.resolve.mockResolvedValue({principal:{actorId:'actor-a'}});mocks.rate.mockResolvedValue({allowed:true});mocks.create.mockResolvedValue({id:'work-a'});mocks.update.mockResolvedValue({id:'work-a'});mocks.list.mockResolvedValue({items:[],nextOffset:null});});
afterEach(()=>vi.unstubAllEnvs());
describe('team work routes',()=>{
 it('derives authority from the signed-in actor and route',async()=>{
  const res=await POST(request(body),ctx);expect(res.status).toBe(200);
  expect(mocks.resolve).toHaveBeenCalledWith('team','team-a','clerk-a');
  expect(mocks.create).toHaveBeenCalledWith('team-a','actor-a',{...body,description:''});
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({actorClerkId:'clerk-a',resource:'TeamWorkItem',resourceId:'work-a'}));
  expect(res.headers.get('cache-control')).toBe('no-store');
 });
 it.each(['actorId','teamId','spaceId'])('rejects a forged %s',async field=>{
  expect((await POST(request({...body,[field]:'victim'}),ctx)).status).toBe(400);expect(mocks.create).not.toHaveBeenCalled();
 });
 it('does not read or mutate after membership is revoked',async()=>{
  mocks.resolve.mockRejectedValue(new Error('revoked'));
  expect((await GET(new Request('https://app.test/api/teams/team-a/work'),ctx)).ok).toBe(false);
  expect((await POST(request(body),ctx)).ok).toBe(false);expect(mocks.list).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();
 });
 it('passes completed filtering and pagination to the scoped query',async()=>{
  await GET(new Request('https://app.test/api/teams/team-a/work?offset=50&closed=true'),ctx);
  expect(mocks.list).toHaveBeenCalledWith('team-a','actor-a',50,true);
  expect((await GET(new Request('https://app.test/api/teams/team-a/work?closed=maybe'),ctx)).status).toBe(400);
  expect((await GET(new Request('https://app.test/api/teams/team-a/work?offset=-1'),ctx)).status).toBe(400);
 });
 it('requires a version and does not audit conflicting writes',async()=>{
  const update={id:'ad02509c-e623-4265-80ab-078b65ac80fd',action:'accept'};
  expect((await PATCH(request(update,'PATCH'),ctx)).status).toBe(400);
  mocks.update.mockRejectedValue(new Error('Work changed'));
  expect((await PATCH(request({...update,version:1},'PATCH'),ctx)).status).toBe(409);expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('blocks disabled, anonymous and rate-limited writes',async()=>{
  vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','false');expect((await POST(request(body),ctx)).status).toBe(404);
  vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');mocks.auth.mockResolvedValue({userId:null});expect((await POST(request(body),ctx)).status).toBe(401);
  mocks.auth.mockResolvedValue({userId:'clerk-a'});mocks.rate.mockResolvedValue({allowed:false});expect((await POST(request(body),ctx)).status).toBe(429);expect(mocks.create).not.toHaveBeenCalled();
 });
});
