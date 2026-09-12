import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),resolve:vi.fn(),share:vi.fn(),revoke:vi.fn(),list:vi.fn(),candidates:vi.fn(),audit:vi.fn(),brokerShare:vi.fn(),brokerRevoke:vi.fn(),brokerCandidates:vi.fn(),edit:vi.fn(),refresh:vi.fn()}));
vi.mock('@clerk/nextjs/server',()=>({auth:mocks.auth}));
vi.mock('@/lib/workforce/scope',()=>({resolveWorkforceScope:mocks.resolve}));
vi.mock('@/lib/teams/shared-records',()=>({RECORD_KINDS:['contact','deal','property'],shareRecord:mocks.share,revokeRecord:mocks.revoke,listSharedRecords:mocks.list,sharingCandidates:mocks.candidates}));
vi.mock('@/lib/teams/brokerage-records',()=>({shareBrokerageRecord:mocks.brokerShare,revokeBrokerageRecord:mocks.brokerRevoke,brokerageCandidates:mocks.brokerCandidates}));
vi.mock('@/lib/rate-limit',()=>({checkRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/audit',()=>({audit:mocks.audit}));
vi.mock('@/lib/teams/record-edits',()=>({editSharedRecord:mocks.edit,refreshEditedRecordIndex:mocks.refresh,TeamRecordEditError:class extends Error {constructor(public status:number,message:string){super(message);}}}));
vi.mock('next/server',async importOriginal=>({...await importOriginal<typeof import('next/server')>(),after:vi.fn()}));
import {TeamRecordEditError} from '@/lib/teams/record-edits';
import {GET,POST} from '@/app/api/teams/[teamId]/records/route';
const context={params:Promise.resolve({teamId:'team-a'})};
const request=(body:unknown)=>new Request('https://app.test/api/teams/team-a/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CHIPPI_WORKFORCE_ENABLED','true');vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');mocks.auth.mockResolvedValue({userId:'clerk-a'});mocks.resolve.mockResolvedValue({principal:{actorId:'actor-a',name:'Team A'}});mocks.share.mockResolvedValue({id:'grant-a'});mocks.revoke.mockResolvedValue({spaceId:'space-a'});mocks.list.mockResolvedValue({records:[],nextOffset:null});});
afterEach(()=>vi.unstubAllEnvs());
describe('team sharing API',()=>{
 const editBody={action:'edit',grantId:'10000000-0000-4000-8000-000000000001',source:'personal',requestId:'20000000-0000-4000-8000-000000000001',revision:'2026-09-08T12:00:00Z',changes:{name:'Corrected name'}};
 it('binds delegated edits to authenticated team authority and audits the receipt',async()=>{
  mocks.edit.mockResolvedValue({id:editBody.requestId,recordKind:'contact',recordId:'person-a',spaceId:'space-a'});mocks.refresh.mockResolvedValue(undefined);
  expect((await POST(request(editBody),context)).status).toBe(200);
  const {action,...input}=editBody;
  expect(mocks.edit).toHaveBeenCalledWith('team-a','actor-a',input);
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({resource:'TeamRecordEdit',resourceId:editBody.requestId}));
 });
 it('rejects private fields and caller-supplied authority before editing',async()=>{
  for(const body of [{...editBody,changes:{notes:'private'}},{...editBody,actorId:'victim'},{...editBody,changes:{}}])expect((await POST(request(body),context)).status).toBe(400);
  expect(mocks.edit).not.toHaveBeenCalled();
 });
 it('preserves revoked and stale edit errors without recording success',async()=>{
  for(const status of [403,409,503]){mocks.edit.mockRejectedValue(new TeamRecordEditError(status,'Refresh this record'));expect((await POST(request(editBody),context)).status).toBe(status);}
  expect(mocks.audit).not.toHaveBeenCalled();expect(mocks.refresh).not.toHaveBeenCalled();
 });

 it('derives brokerage sharing authority from the team instead of caller supplied account IDs',async()=>{
  mocks.brokerShare.mockResolvedValue({id:'broker-grant',brokerageId:'broker-a'});
  expect((await POST(request({action:'share_brokerage',kind:'contact',recordId:'person-a'}),context)).status).toBe(200);
  expect(mocks.brokerShare).toHaveBeenCalledWith('team-a','actor-a',expect.objectContaining({recordId:'person-a'}));
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({resource:'BrokerageTeamRecordGrant',metadata:expect.objectContaining({brokerageId:'broker-a'})}));
  expect((await POST(request({action:'share_brokerage',kind:'contact',recordId:'person-a',brokerageId:'foreign'}),context)).status).toBe(400);
 });
 it('routes brokerage candidates through the brokerage manager reader',async()=>{
  mocks.brokerCandidates.mockResolvedValue({records:[],spaces:[],nextOffset:null});
  expect((await GET(new Request('https://app.test/api/teams/team-a/records?mode=brokerage_candidates&kind=property'),context)).status).toBe(200);
  expect(mocks.brokerCandidates).toHaveBeenCalledWith('team-a','actor-a',expect.objectContaining({kind:'property'}));
 });

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
