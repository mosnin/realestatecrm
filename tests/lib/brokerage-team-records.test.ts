import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
type Row=Record<string,any>;
const state=vi.hoisted(()=>({tables:{} as Record<string,Row[]>,actorRole:'member',denyActor:false,failTable:'',teamOwner:'owner',parentKind:'brokerage',calls:[] as {table:string;filters:[string,unknown][];mode:string}[]}));
vi.mock('@/lib/teams/server',()=>({teamAccess:async(teamId:string,actorId:string)=>{
 if(state.denyActor||teamId!=='team-a'||!['viewer','owner'].includes(actorId))throw new Error('Team unavailable');
 return {team:{id:teamId,ownerId:state.teamOwner,parentKind:state.parentKind,parentRouteId:'brokerage-a'},role:state.actorRole};
}}));
vi.mock('@/lib/supabase-guard',()=>({unscoped:(query:unknown)=>query}));
vi.mock('@/lib/supabase', () => ({supabase:{from(table:string){
  const filters:[string,unknown][]=[];let mode='select';let value:Row={};let range:[number,number]|undefined;
  const run=()=>{
    state.calls.push({table,filters:[...filters],mode});
    if(state.failTable===table)return {data:null,error:{message:'outage'}};
    let rows=(state.tables[table]??[]).filter(row=>filters.every(([key,val])=>key.split('.').reduce((value:any,part:string)=>value?.[part],row)===val));
    if(mode==='upsert'){
      const existing=(state.tables[table]??[]).find(row=>['teamId','brokerageId','recordKind','recordId'].every(key=>key.split('.').reduce((value:any,part:string)=>value?.[part],row)===value[key]));
      if(existing){Object.assign(existing,value);rows=[existing];}else{const row={id:'new-grant',...value};state.tables[table].push(row);rows=[row];}
    }
    if(mode==='update')rows.forEach(row=>Object.assign(row,value));
    if(range)rows=rows.slice(range[0],range[1]+1);
    return {data:rows,error:null};
  };
  const query:Row={select:()=>query,eq:(key:string,val:unknown)=>{filters.push([key,val]);return query;},is:(key:string,val:unknown)=>{filters.push([key,val]);return query;},order:()=>query,
    range:(from:number,to:number)=>{range=[from,to];return query;},ilike:()=>query,
    upsert:(row:Row)=>{mode='upsert';value=row;return query;},update:(row:Row)=>{mode='update';value=row;return query;},
    maybeSingle:async()=>{const result=run();return {...result,data:result.data?.[0]??null};},single:async()=>{const result=run();return {...result,data:result.data?.[0]??null};},
    then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(run()).then(resolve)};
  return query;
}}}));

import {brokerageCandidates,shareBrokerageRecord,revokeBrokerageRecord,listBrokerageRecords} from '@/lib/teams/brokerage-records';
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{
 vi.stubEnv('CHIPPI_BROKERAGE_TEAM_SHARING_ENABLED','true');
 state.actorRole='member';state.denyActor=false;state.failTable='';state.calls=[];state.teamOwner='owner';state.parentKind='brokerage';
 state.tables={
  User:[{id:'owner',status:'active',platformRole:'user'}],
  BrokerageMembership:[{brokerageId:'brokerage-a',userId:'owner',role:'broker_owner'},{brokerageId:'brokerage-a',userId:'viewer',role:'broker_agent'}],
  BrokerageTeamRecordGrant:[{id:'grant-a',teamId:'team-a',brokerageId:'brokerage-a',grantedBy:'owner',recordKind:'contact',recordId:'person-a',revokedAt:null}],
  Contact:[{id:'person-a',brokerageId:'brokerage-a',spaceId:'agent-space',name:'Alex',email:'alex@example.test',phone:null,leadType:'buyer',notes:'PRIVATE'},{id:'foreign',brokerageId:'brokerage-b',name:'Other firm'}],
  CollaborationTeamMember:[],
 };
});
describe('brokerage records explicitly shared with a team',()=>{
 it('exposes write permission only with both the feature and an explicit manager grant',async()=>{
  vi.stubEnv('CHIPPI_TEAM_RECORD_EDITS_ENABLED','true');state.tables.Contact[0].updatedAt='2026-09-08T12:00:00Z';
  expect((await listBrokerageRecords('team-a','viewer')).records[0]).not.toHaveProperty('canEdit');
  state.tables.BrokerageTeamRecordGrant[0].canEdit=true;
  expect((await listBrokerageRecords('team-a','viewer')).records[0]).toMatchObject({canEdit:true,revision:'2026-09-08T12:00:00Z'});
  state.tables.BrokerageMembership[1].role='broker_admin';
  await shareBrokerageRecord('team-a','viewer',{kind:'contact',recordId:'person-a',allowEdits:false});
  expect(state.tables.BrokerageTeamRecordGrant[0].canEdit).toBe(false);
 });

 it('preserves existing team sharing before the new migration is activated',async()=>{
  vi.stubEnv('CHIPPI_BROKERAGE_TEAM_SHARING_ENABLED','false');
  expect(await listBrokerageRecords('team-a','viewer')).toEqual({records:[],nextOffset:null});
  await expect(shareBrokerageRecord('team-a','viewer',{kind:'contact',recordId:'person-a'})).rejects.toThrow('not enabled');
  expect(state.calls).toEqual([]);
 });

 it('serves allowed fields only after the grant and ownership checks',async()=>{
  const result=await listBrokerageRecords('team-a','viewer');
  expect(result.records).toEqual([{grantId:'grant-a',kind:'contact',title:'Alex',fields:{name:'Alex',email:'alex@example.test',phone:null,leadType:'buyer'},source:'brokerage',canRevoke:false}]);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(state.calls).toContainEqual({table:'Contact',mode:'select',filters:[['brokerageId','brokerage-a'],['id','person-a']]});
 });
 it('does not turn agent assignment or team administration into brokerage sharing authority',async()=>{
  state.actorRole='admin';
  await expect(shareBrokerageRecord('team-a','viewer',{kind:'contact',recordId:'person-a'})).rejects.toThrow('brokerage managers');
  await expect(brokerageCandidates('team-a','viewer',{kind:'contact'})).rejects.toThrow('brokerage managers');
  expect(state.calls.some(call=>call.mode==='upsert')).toBe(false);
 });
 it('lets a brokerage manager select records from this team’s sponsoring brokerage',async()=>{
  state.tables.BrokerageMembership[1].role='broker_admin';
  expect((await brokerageCandidates('team-a','viewer',{kind:'contact'})).records.map(row=>row.id)).toEqual(['person-a']);
  await shareBrokerageRecord('team-a','viewer',{kind:'contact',recordId:'person-a'});
  expect(state.tables.BrokerageTeamRecordGrant[0]).toMatchObject({teamId:'team-a',brokerageId:'brokerage-a',grantedBy:'viewer'});
  await expect(shareBrokerageRecord('team-a','viewer',{kind:'contact',recordId:'foreign'})).rejects.toThrow('unavailable');
 });
 it.each(['demoted','offboarded','revoked','moved','removed-from-team'])('withdraws visibility after %s',async reason=>{
  if(reason==='demoted')state.tables.BrokerageMembership[0].role='broker_agent';
  if(reason==='offboarded')state.tables.User[0].status='offboarded';
  if(reason==='revoked')state.tables.BrokerageTeamRecordGrant[0].revokedAt='today';
  if(reason==='moved')state.tables.Contact[0].brokerageId='brokerage-b';
  if(reason==='removed-from-team'){state.teamOwner='other';state.tables.CollaborationTeamMember=[{teamId:'team-a',userId:'owner',role:'admin',revokedAt:'today'}];}
  expect((await listBrokerageRecords('team-a','viewer')).records).toEqual([]);
 });
 it('never reads shares after the viewer loses team membership',async()=>{
  state.denyActor=true;await expect(listBrokerageRecords('team-a','viewer')).rejects.toThrow();expect(state.calls).toEqual([]);
 });
 it('keeps permission lookup failures explicit',async()=>{
  state.failTable='BrokerageMembership';await expect(listBrokerageRecords('team-a','viewer')).rejects.toThrow('authority unavailable');
 });
 it('binds deals through the workspace’s brokerage and strips joined metadata',async()=>{
  state.tables.BrokerageTeamRecordGrant[0].recordKind='deal';state.tables.BrokerageTeamRecordGrant[0].recordId='deal-a';
  state.tables.Deal=[{id:'deal-a',title:'Purchase',status:'active',value:400000,closeDate:null,Space:{brokerageId:'brokerage-a'},commissionRate:3}];
  const result=await listBrokerageRecords('team-a','viewer');
  expect(result.records[0].fields).toEqual({title:'Purchase',status:'active',value:400000,closeDate:null});
  state.tables.Deal[0].Space.brokerageId='brokerage-b';expect((await listBrokerageRecords('team-a','viewer')).records).toEqual([]);
 });
 it('lets the team owner withdraw a share but does not revoke another brokerage’s grant',async()=>{
  state.actorRole='owner';await revokeBrokerageRecord('team-a','viewer','grant-a');expect(state.tables.BrokerageTeamRecordGrant[0].revokedAt).toBeTruthy();
  state.tables.BrokerageTeamRecordGrant[0].brokerageId='brokerage-b';await expect(revokeBrokerageRecord('team-a','viewer','grant-a')).rejects.toThrow('unavailable');
 });
 it('never exposes brokerage grants to a personal team',async()=>{
  state.parentKind='personal';expect((await listBrokerageRecords('team-a','viewer')).records).toEqual([]);expect(state.calls).toEqual([]);
 });
});
