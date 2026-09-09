import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
type Row=Record<string,any>;
const state=vi.hoisted(()=>({rows:[] as Row[],role:'member',denied:false,offboarded:false,conflict:false}));
vi.mock('@/lib/teams/server',()=>({
 teamAccess:async(team:string,actor:string)=>{if(state.denied||team!=='team-a'||!['actor','other'].includes(actor))throw new Error('Team unavailable');return {role:state.role};},
 teamPeople:async()=>[{id:'actor',name:'Alex'},{id:'other',name:'Morgan'}],
}));
vi.mock('@/lib/supabase',()=>({supabase:{from(table:string){
 const filters:((row:Row)=>boolean)[]=[];let patch:Row|undefined;let inserted:Row|undefined;let range=[0,999];
 const run=()=>{
  if(table==='User')return [{id:'actor',status:state.offboarded?'offboarded':'active'}];
  if(patch&&state.conflict){state.rows[0].version++;state.conflict=false;}
  if(inserted)state.rows.push({...inserted,status:'assigned',version:1});
  const selected=state.rows.filter(row=>filters.every(filter=>filter(row)));
  if(patch)selected.forEach(row=>Object.assign(row,patch));
  return (inserted?[inserted]:selected).slice(range[0],range[1]+1).map(row=>({...row}));
 };
 const q:Row={select:()=>q,lt:(key:string,value:string)=>{filters.push(row=>row[key]<value);return q;},eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return q;},in:(key:string,values:unknown[])=>{filters.push(row=>values.includes(row[key]));return q;},order:()=>q,range:(from:number,to:number)=>{range=[from,to];return q;},insert:(value:Row)=>{inserted=value;return q;},update:(value:Row)=>{patch=value;return q;},maybeSingle:async()=>({data:run()[0]??null,error:null}),single:async()=>inserted&&state.rows.some(row=>row.id===inserted!.id)?({data:null,error:{code:'23505'}}):({data:run()[0]??null,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:run(),count:run().length,error:null}).then(resolve)};
 return q;
}}}));
import {listTeamWork,createTeamWork,updateTeamWork,teamWorkAttention} from '@/lib/teams/work-items';
const base={id:'work-a',teamId:'team-a',assignedTo:'actor',createdBy:'actor',status:'assigned',version:1,title:'Inspection',dueAt:'2026-09-10T10:00:00Z'};
beforeEach(()=>{state.rows=[{...base},{...base,id:'foreign',teamId:'team-b'}];state.role='member';state.denied=false;state.offboarded=false;state.conflict=false;});
describe('team work storage authority',()=>{
 it('reads only the team and requested status page',async()=>{
  state.rows.push({...base,id:'closed',status:'done'});
  expect((await listTeamWork('team-a','actor')).items.map(item=>item.id)).toEqual(['work-a']);
  expect((await listTeamWork('team-a','actor',0,true)).items.map(item=>item.id)).toEqual(['closed']);
 });
 it('cannot acknowledge another team’s record',async()=>{
  await expect(updateTeamWork('team-a','actor',{id:'foreign',version:1,action:'accept'})).rejects.toThrow('unavailable');expect(state.rows[1].status).toBe('assigned');
 });
 it('keeps a conflicting update from overwriting the winner',async()=>{
  state.conflict=true;await expect(updateTeamWork('team-a','actor',{id:'work-a',version:1,action:'accept'})).rejects.toThrow('changed');expect(state.rows[0]).toMatchObject({status:'assigned',version:2});
 });
 it('rejects revoked membership before mutation',async()=>{
  state.denied=true;await expect(updateTeamWork('team-a','actor',{id:'work-a',version:1,action:'accept'})).rejects.toThrow('unavailable');expect(state.rows[0].version).toBe(1);
 });
 it('members can create their own work but only managers can delegate',async()=>{
  const input={title:'Follow up',description:'',assignedTo:'other',dueAt:base.dueAt};
  await expect(createTeamWork('team-a','actor',input)).rejects.toThrow('managers');
  state.role='admin';await createTeamWork('team-a','actor',input);expect(state.rows[2]).toMatchObject({teamId:'team-a',assignedTo:'other',createdBy:'actor'});
 });
 it('rejects assignment to an offboarded account',async()=>{
  state.role='admin';state.offboarded=true;await expect(createTeamWork('team-a','actor',{title:'Follow up',description:'',assignedTo:'other',dueAt:base.dueAt})).rejects.toThrow('unavailable');expect(state.rows).toHaveLength(2);
 });
});

it('reconciles a repeated assignment request without creating a second task',async()=>{
 const input={title:'Follow up',description:'',assignedTo:'actor',dueAt:base.dueAt,requestId:'10000000-0000-4000-8000-000000000001'};
 const first=await createTeamWork('team-a','actor',input),retry=await createTeamWork('team-a','actor',input);
 expect(first.id).toBe(retry.id);expect(state.rows).toHaveLength(3);
 await expect(createTeamWork('team-a','actor',{...input,title:'Different work'})).rejects.toThrow('Request changed');expect(state.rows).toHaveLength(3);
});
it('does not reconcile another team or actor’s request identity',async()=>{
 const input={title:base.title,description:'',assignedTo:'actor',dueAt:base.dueAt,requestId:'foreign'};
 await expect(createTeamWork('team-a','actor',input)).rejects.toThrow('Request changed');
 state.rows[0].createdBy='other';await expect(createTeamWork('team-a','actor',{...input,requestId:'work-a'})).rejects.toThrow('Request changed');
});
it('routes overdue team work to managers while members see only their own attention count',async()=>{
 state.rows=[{...base,dueAt:'2020-01-01'},{...base,id:'other',assignedTo:'other',dueAt:'2020-01-01'},{...base,id:'closed',status:'done',dueAt:'2020-01-01'},{...base,id:'foreign',teamId:'team-b',dueAt:'2020-01-01'}];
 expect(await teamWorkAttention('team-a','actor')).toEqual({overdue:1,manager:false});state.role='admin';
 expect(await teamWorkAttention('team-a','actor')).toEqual({overdue:2,manager:true});
 state.denied=true;await expect(teamWorkAttention('team-a','actor')).rejects.toThrow('unavailable');
});
