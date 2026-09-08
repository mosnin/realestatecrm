import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),resolve:vi.fn(),share:vi.fn(),revoke:vi.fn(),list:vi.fn(),candidates:vi.fn(),audit:vi.fn()}));
vi.mock('@clerk/nextjs/server',()=>({auth:mocks.auth}));
vi.mock('@/lib/workforce/scope',()=>({resolveWorkforceScope:mocks.resolve}));
vi.mock('@/lib/teams/shared-records',()=>({RECORD_KINDS:['contact','deal','property'],shareRecord:mocks.share,revokeRecord:mocks.revoke,listSharedRecords:mocks.list,sharingCandidates:mocks.candidates}));
vi.mock('@/lib/rate-limit',()=>({checkRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/audit',()=>({audit:mocks.audit}));
import {GET,POST} from '@/app/api/teams/[teamId]/records/route';
const context={params:Promise.resolve({teamId:'team-a'})};
const request=(body:unknown)=>new Request('https://app.test/api/teams/team-a/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CHIPPI_WORKFORCE_ENABLED','true');vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');mocks.auth.mockResolvedValue({userId:'clerk-a'});mocks.resolve.mockResolvedValue({principal:{actorId:'actor-a',name:'Team A'}});mocks.share.mockResolvedValue({id:'grant-a'});mocks.revoke.mockResolvedValue({spaceId:'space-a'});mocks.list.mockResolvedValue({records:[],nextOffset:null});});
afterEach(()=>vi.unstubAllEnvs());
describe('team sharing API',()=>{
 it('derives the actor and team from authenticated authority',async()=>{
  const response=await POST(request({action:'share',spaceId:'space-a',kind:'contact',recordId:'person-a'}),context);
  expect(response.status).toBe(200);expect(mocks.resolve).toHaveBeenCalledWith('team','team-a','clerk-a');expect(mocks.share).toHaveBeenCalledWith('team-a','actor-a',expect.objectContaining({recordId:'person-a'}));expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({spaceId:'space-a',resource:'TeamRecordGrant'}));
 });
 it('does not allow body actor IDs or unknown actions',async()=>{
  expect((await POST(request({action:'share',spaceId:'space-a',kind:'contact',recordId:'person-a',actorId:'victim'}),context)).status).toBe(400);expect(mocks.share).not.toHaveBeenCalled();
 });
 it('checks current team access for reads and writes',async()=>{
  mocks.resolve.mockRejectedValue(new Error('Revoked'));expect((await GET(new Request('https://app.test/api/teams/team-a/records'),context)).status).toBe(403);expect((await POST(request({action:'share',spaceId:'space-a',kind:'contact',recordId:'person-a'}),context)).status).toBe(403);expect(mocks.share).not.toHaveBeenCalled();expect(mocks.list).not.toHaveBeenCalled();
 });
 it('keeps failed shares visibly failed without a success audit',async()=>{
  mocks.share.mockRejectedValue(new Error('Unavailable'));const response=await POST(request({action:'share',spaceId:'space-a',kind:'contact',recordId:'person-a'}),context);expect(response.status).toBe(403);expect(mocks.audit).not.toHaveBeenCalled();
 });
 it('validates pagination and disables response caching',async()=>{
  expect((await GET(new Request('https://app.test/api/teams/team-a/records?offset=-1'),context)).status).toBe(400);
  const response=await GET(new Request('https://app.test/api/teams/team-a/records?kind=deal&offset=25'),context);expect(response.headers.get('cache-control')).toBe('no-store');expect(mocks.list).toHaveBeenCalledWith('team-a','actor-a',expect.objectContaining({kind:'deal',offset:25}));
 });
 it('keeps the route unavailable before rollout',async()=>{
  vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','false');expect((await GET(new Request('https://app.test/api/teams/team-a/records'),context)).status).toBe(404);expect(mocks.resolve).not.toHaveBeenCalled();
 });
});
