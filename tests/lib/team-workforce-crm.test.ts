import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
const { shared, execute, work }=vi.hoisted(()=>({shared:vi.fn(),execute:vi.fn(),work:vi.fn()}));
vi.mock('@/lib/teams/shared-records',()=>({listSharedRecords:shared,RECORD_KINDS:['contact','deal','property']}));
vi.mock('@/lib/teams/work-items',()=>({listTeamWork:work}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/lib/ai-tools/registry',()=>({getTool:vi.fn()}));
vi.mock('@/lib/ai-tools/execute',()=>({executeTool:execute}));
import {queryWorkforceCrm} from '@/lib/workforce/crm';
const team={kind:'team' as const,scopeId:'team-a',actorId:'actor-a',name:'Team A',role:'member' as const};
const signal=new AbortController().signal;
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');shared.mockResolvedValue({records:[],nextOffset:null});});
afterEach(()=>vi.unstubAllEnvs());
describe('team workforce CRM catalog',()=>{
 it('advertises the bounded shared-record and work readers',async()=>{
  const result=await queryWorkforceCrm(team,'clerk-a',{operation:'catalog'},signal);
  expect(result).toMatchObject({tools:[{name:'list_shared_records'},{name:'list_team_work'}]});expect((result as {tools:unknown[]}).tools).toHaveLength(2);
 });
 it('uses the verified team and actor and never the unrestricted CRM executor',async()=>{
  await queryWorkforceCrm(team,'clerk-a',{operation:'query',tool:'list_shared_records',args:{kind:'deal',offset:25}},signal);
  expect(shared).toHaveBeenCalledWith('team-a','actor-a',{kind:'deal',offset:25});expect(execute).not.toHaveBeenCalled();
 });
 it.each([{tool:'list_contacts'},{tool:'send_email'},{tool:'list_shared_records',spaceId:'foreign'}, {tool:'list_shared_records',args:{teamId:'foreign'}}])('rejects broader authority %#',async input=>{
  await expect(queryWorkforceCrm(team,'clerk-a',{operation:'query',...input},signal)).rejects.toThrow();expect(shared).not.toHaveBeenCalled();expect(execute).not.toHaveBeenCalled();
 });
 it('reads work only within the verified team scope',async()=>{
  work.mockResolvedValue({items:[],nextOffset:null});
  await queryWorkforceCrm(team,'clerk-a',{operation:'query',tool:'list_team_work',args:{offset:50,closed:true}},signal);
  expect(work).toHaveBeenCalledWith('team-a','actor-a',50,true);
  await expect(queryWorkforceCrm(team,'clerk-a',{operation:'query',tool:'list_team_work',args:{actorId:'foreign'}},signal)).rejects.toThrow();
 });
 it('preserves a live denial from the grant reader',async()=>{
  shared.mockRejectedValue(new Error('Team unavailable'));await expect(queryWorkforceCrm(team,'clerk-a',{operation:'query',tool:'list_shared_records'},signal)).rejects.toThrow('Team unavailable');
 });
 it('keeps team CRM unavailable when rollout is disabled',async()=>{
  vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','false');expect(await queryWorkforceCrm(team,'clerk-a',{operation:'catalog'},signal)).toEqual({tools:[]});
 });
});
