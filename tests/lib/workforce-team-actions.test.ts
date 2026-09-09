import {afterEach,beforeEach,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),edit:vi.fn(),refresh:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/lib/teams/work-items',async original=>({...await original<typeof import('@/lib/teams/work-items')>(),createTeamWork:mocks.create,updateTeamWork:mocks.update}));
vi.mock('@/lib/teams/record-edits',()=>({editSharedRecord:mocks.edit,refreshEditedRecordIndex:mocks.refresh}));
vi.mock('@/lib/audit',()=>({audit:mocks.audit}));
vi.mock('next/server',()=>({after:vi.fn()}));
import {executeTeamAction} from '@/lib/workforce/team-actions';
const team={kind:'team' as const,scopeId:'team-a',actorId:'actor-a',name:'Team',role:'member' as const};
const signal=new AbortController().signal;
const args={title:'Confirm inspection',assignedTo:'actor-a',dueAt:'2026-09-10T10:00:00Z',requestId:'10000000-0000-4000-8000-000000000001'};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CHIPPI_TEAM_CRM_ENABLED','true');vi.stubEnv('CHIPPI_TEAM_ACTIONS_ENABLED','true');mocks.create.mockResolvedValue({id:args.requestId});mocks.refresh.mockResolvedValue(undefined);});
afterEach(()=>vi.unstubAllEnvs());
it('creates actual work using the trusted team and actor with a stable request ID',async()=>{
 expect(await executeTeamAction(team,'clerk-a',{operation:'action',tool:'create_team_work',args},signal)).toEqual({item:{id:args.requestId}});
 expect(mocks.create).toHaveBeenCalledWith('team-a','actor-a',{...args,description:''});
 expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({actorClerkId:'clerk-a',metadata:{teamId:'team-a',execution:'agent'}}));
});
it('rejects missing retry identity and caller-supplied authority',async()=>{
 for(const bad of [{...args,requestId:undefined},{...args,actorId:'victim'},{...args,teamId:'foreign'}])await expect(executeTeamAction(team,'clerk-a',{operation:'action',tool:'create_team_work',args:bad},signal)).rejects.toThrow();
 expect(mocks.create).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled();
});
it('does not turn a non-team principal or CRM read into a write',async()=>{
 await expect(executeTeamAction({...team,kind:'personal'},'clerk-a',{operation:'action',tool:'create_team_work',args},signal)).rejects.toThrow();
 await expect(executeTeamAction(team,'clerk-a',{operation:'query',tool:'create_team_work',args},signal)).rejects.toThrow();
 await expect(executeTeamAction(team,'clerk-a',{operation:'action',tool:'create_team_work',args,spaceId:'foreign'},signal)).rejects.toThrow();
 expect(mocks.create).not.toHaveBeenCalled();
});
it('keeps the mutation surface unavailable until enabled',async()=>{
 vi.stubEnv('CHIPPI_TEAM_ACTIONS_ENABLED','false');await expect(executeTeamAction(team,'clerk-a',{operation:'action_catalog'},signal)).rejects.toThrow();
});
it('honors cancellation before dispatch and preserves live permission failures',async()=>{
 const controller=new AbortController();controller.abort();await expect(executeTeamAction(team,'clerk-a',{operation:'action',tool:'create_team_work',args},controller.signal)).rejects.toThrow();expect(mocks.create).not.toHaveBeenCalled();
 mocks.create.mockRejectedValue(new Error('Only managers can assign'));await expect(executeTeamAction(team,'clerk-a',{operation:'action',tool:'create_team_work',args},signal)).rejects.toThrow('Only managers');expect(mocks.audit).not.toHaveBeenCalled();
});
it('routes versioned updates without allowing the agent to replace the assignee identity',async()=>{
 mocks.update.mockResolvedValue({id:args.requestId,status:'accepted'});
 await executeTeamAction(team,'clerk-a',{operation:'action',tool:'update_team_work',args:{id:args.requestId,version:1,action:'accept'}},signal);
 expect(mocks.update).toHaveBeenCalledWith('team-a','actor-a',{id:args.requestId,version:1,action:'accept'});
});
it('uses the atomic delegated editor only when the owner-edit feature is enabled',async()=>{
 const edit={grantId:args.requestId,source:'personal',requestId:'20000000-0000-4000-8000-000000000001',revision:'2026-09-08T12:00:00Z',changes:{name:'Alex'}};
 vi.stubEnv('CHIPPI_TEAM_RECORD_EDITS_ENABLED','false');await expect(executeTeamAction(team,'clerk-a',{operation:'action',tool:'edit_shared_record',args:edit},signal)).rejects.toThrow();expect(mocks.edit).not.toHaveBeenCalled();
 vi.stubEnv('CHIPPI_TEAM_RECORD_EDITS_ENABLED','true');mocks.edit.mockResolvedValue({id:edit.requestId,recordId:'record-a'});
 expect(await executeTeamAction(team,'clerk-a',{operation:'action',tool:'edit_shared_record',args:edit},signal)).toMatchObject({receipt:{id:edit.requestId}});
 expect(mocks.edit).toHaveBeenCalledWith('team-a','actor-a',edit);
});
