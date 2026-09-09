import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
type Row = Record<string, any>;
const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, actorRole: 'member', denyActor: false, failTable: '', calls: [] as {table:string; filters:[string,unknown][]; mode:string}[] }));
vi.mock('@/lib/teams/server', () => ({ teamAccess: async (teamId:string, actorId:string) => {
  if(state.denyActor || teamId!=='team-a' || actorId!=='viewer')throw new Error('Team unavailable');
  return {team:{id:teamId,ownerId:'owner'},role:state.actorRole};
} }));
vi.mock('@/lib/supabase-guard', () => ({unscoped:(query:unknown)=>query}));
vi.mock('@/lib/supabase', () => ({supabase:{from(table:string){
  const filters:[string,unknown][]=[];let mode='select';let value:Row={};let range:[number,number]|undefined;
  const run=()=>{
    state.calls.push({table,filters:[...filters],mode});
    if(state.failTable===table)return {data:null,error:{message:'outage'}};
    let rows=(state.tables[table]??[]).filter(row=>filters.every(([key,val])=>row[key]===val));
    if(mode==='upsert'){
      const existing=(state.tables[table]??[]).find(row=>['teamId','spaceId','recordKind','recordId'].every(key=>row[key]===value[key]));
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
import { listSharedRecords, revokeRecord, shareRecord, sharingCandidates } from '@/lib/teams/shared-records';
afterEach(()=>vi.unstubAllEnvs());
beforeEach(()=>{
  vi.stubEnv('CHIPPI_TEAM_RECORD_EDITS_ENABLED','false');
  state.actorRole='member';state.denyActor=false;state.failTable='';state.calls=[];
  state.tables={
    TeamRecordGrant:[{id:'grant-a',teamId:'team-a',spaceId:'space-a',recordKind:'contact',recordId:'person-a',grantedBy:'owner',revokedAt:null}],
    User:[{id:'owner',status:'active',platformRole:'user'}],
    Space:[{id:'space-a',name:'Personal business',ownerId:'owner'},{id:'space-viewer',name:'My business',ownerId:'viewer'}],
    Contact:[{id:'person-a',spaceId:'space-a',brokerageId:null,name:'Alex',email:'alex@example.test',phone:null,leadType:'buyer',notes:'PRIVATE',applicationData:'PRIVATE'},
      {id:'person-private',spaceId:'space-a',brokerageId:null,name:'Private person'}, {id:'person-viewer',spaceId:'space-viewer',brokerageId:null,name:'My client',leadType:'seller'}],
    CollaborationTeamMember:[],
  };
});
describe('explicit team record sharing',()=>{
  it('requires explicit owner permission before exposing editing or a revision',async()=>{
    state.tables.Contact[0].updatedAt='2026-09-08T12:00:00Z';state.tables.TeamRecordGrant[0].canEdit=true;
    expect((await listSharedRecords('team-a','viewer')).records[0]).not.toHaveProperty('canEdit');
    vi.stubEnv('CHIPPI_TEAM_RECORD_EDITS_ENABLED','true');
    expect((await listSharedRecords('team-a','viewer')).records[0]).toMatchObject({canEdit:true,revision:'2026-09-08T12:00:00Z'});
    state.tables.TeamRecordGrant[0].canEdit=false;
    expect((await listSharedRecords('team-a','viewer')).records[0]).not.toHaveProperty('revision');
  });
  it('lets the source owner explicitly opt in and later remove write permission',async()=>{
    const input={spaceId:'space-viewer',kind:'contact' as const,recordId:'person-viewer',allowEdits:true};
    await expect(shareRecord('team-a','viewer',input)).rejects.toThrow('not enabled');
    vi.stubEnv('CHIPPI_TEAM_RECORD_EDITS_ENABLED','true');await shareRecord('team-a','viewer',input);
    expect(state.tables.TeamRecordGrant[1].canEdit).toBe(true);
    await shareRecord('team-a','viewer',{...input,allowEdits:false});expect(state.tables.TeamRecordGrant[1].canEdit).toBe(false);
  });

  it('returns only granted rows and allowed fields, with exact source-space filters',async()=>{
    const result=await listSharedRecords('team-a','viewer');
    expect(result.records).toEqual([{grantId:'grant-a',kind:'contact',title:'Alex',fields:{name:'Alex',email:'alex@example.test',phone:null,leadType:'buyer'},canRevoke:false}]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(state.calls).toContainEqual({table:'Contact',mode:'select',filters:[['spaceId','space-a'],['id','person-a'],['brokerageId',null]]});
  });
  it.each(['deal','property'] as const)('shares only the approved fields for %s',async kind=>{
    state.tables.TeamRecordGrant[0].recordKind=kind;
    state.tables.TeamRecordGrant[0].recordId='record-a';
    state.tables[kind==='deal'?'Deal':'Property']=[{id:'record-a',spaceId:'space-a',brokerageId:null,title:'Sale',status:'active',value:500000,closeDate:null,address:'123 Main',city:'Portland',listingStatus:'active',listPrice:500000,beds:3,baths:2,notes:'PRIVATE',commissionRate:3}];
    const record=(await listSharedRecords('team-a','viewer')).records[0];
    expect(record.kind).toBe(kind);expect(record.title).toBe(kind==='deal'?'Sale':'123 Main');
    expect(record.fields).not.toHaveProperty('notes');expect(record.fields).not.toHaveProperty('commissionRate');
    expect(Object.keys(record.fields)).toHaveLength(kind==='deal'?4:6);
  });
  it('paginates grants instead of returning an unbounded book of business',async()=>{
    state.tables.TeamRecordGrant=Array.from({length:26},(_,index)=>({id:`grant-${index}`,teamId:'team-a',spaceId:'space-a',recordKind:'contact',recordId:`person-${index}`,grantedBy:'owner',revokedAt:null}));
    state.tables.Contact=Array.from({length:26},(_,index)=>({id:`person-${index}`,spaceId:'space-a',brokerageId:null,name:`Person ${index}`}));
    const first=await listSharedRecords('team-a','viewer');const second=await listSharedRecords('team-a','viewer',{offset:first.nextOffset!});
    expect(first.records).toHaveLength(25);expect(first.nextOffset).toBe(25);expect(second.records).toHaveLength(1);expect(second.nextOffset).toBeNull();
  });
  it('does not read CRM rows after the viewer is removed',async()=>{
    state.denyActor=true;await expect(listSharedRecords('team-a','viewer')).rejects.toThrow();expect(state.calls).toEqual([]);
  });
  it.each(['revoked','deleted','transferred','offboarded','banned','grantor-removed'])('hides a %s grant before reading private records',async reason=>{
    if(reason==='revoked')state.tables.TeamRecordGrant[0].revokedAt='today';
    if(reason==='deleted')state.tables.User=[];
    if(reason==='transferred')state.tables.Space[0].ownerId='someone-else';
    if(reason==='offboarded')state.tables.User[0].status='offboarded';
    if(reason==='banned')state.tables.User[0].platformRole='banned';
    if(reason==='grantor-removed'){state.tables.TeamRecordGrant[0].grantedBy='former';state.tables.User.push({id:'former'});state.tables.CollaborationTeamMember=[{teamId:'team-a',userId:'former',role:'member',revokedAt:'today'}];}
    expect((await listSharedRecords('team-a','viewer')).records).toEqual([]);
    expect(state.calls.some(call=>call.table==='Contact')).toBe(false);
  });
  it('never treats a membership or source lookup outage as a successful empty view',async()=>{
    state.failTable='Space';await expect(listSharedRecords('team-a','viewer')).rejects.toThrow('unavailable');
  });
  it('does not let an assigned agent share a brokerage-owned contact',async()=>{
    state.tables.Contact[2].brokerageId='brokerage-a';
    await expect(shareRecord('team-a','viewer',{spaceId:'space-viewer',kind:'contact',recordId:'person-viewer'})).rejects.toThrow();
    expect((await sharingCandidates('team-a','viewer',{kind:'contact'})).records).toEqual([]);
  });
  it('only the source owner can share, even if the actor owns the team',async()=>{
    state.actorRole='owner';await expect(shareRecord('team-a','viewer',{spaceId:'space-a',kind:'contact',recordId:'person-a'})).rejects.toThrow();
    expect(state.calls.some(call=>call.mode==='upsert')).toBe(false);
  });
  it('rejects a foreign record ID inside an owned source workspace',async()=>{
    await expect(shareRecord('team-a','viewer',{spaceId:'space-viewer',kind:'contact',recordId:'person-a'})).rejects.toThrow();
    expect(state.calls.some(call=>call.mode==='upsert')).toBe(false);
  });
  it('shares only a selected owned record without copying or moving it',async()=>{
    await shareRecord('team-a','viewer',{spaceId:'space-viewer',kind:'contact',recordId:'person-viewer'});
    expect(state.tables.TeamRecordGrant[1]).toMatchObject({teamId:'team-a',spaceId:'space-viewer',recordId:'person-viewer',grantedBy:'viewer',revokedAt:null});
    expect(state.calls.filter(call=>call.mode!=='select').map(call=>call.table)).toEqual(['TeamRecordGrant']);
  });
  it('prevents members and team admins from revoking another person’s share',async()=>{
    for(const role of ['member','admin']){state.actorRole=role;await expect(revokeRecord('team-a','viewer','grant-a')).rejects.toThrow('Only');}
    expect(state.tables.TeamRecordGrant[0].revokedAt).toBeNull();
  });
  it('lets the team owner stop sharing and removes future reads',async()=>{
    state.actorRole='owner';await revokeRecord('team-a','viewer','grant-a');
    expect(state.tables.TeamRecordGrant[0].revokedAt).toBeTruthy();expect((await listSharedRecords('team-a','viewer')).records).toEqual([]);
  });
  it('does not enumerate other people’s source workspaces or candidates',async()=>{
    const result=await sharingCandidates('team-a','viewer',{kind:'contact'});
    expect(result.spaces).toEqual([{id:'space-viewer',name:'My business',ownerId:'viewer'}]);
    expect(result.records.map((row:Row)=>row.id)).toEqual(['person-viewer']);
    await expect(sharingCandidates('team-a','viewer',{kind:'contact',spaceId:'space-a'})).rejects.toThrow();
  });
  it('rejects foreign teams and grant IDs',async()=>{
    await expect(listSharedRecords('team-b','viewer')).rejects.toThrow();
    state.tables.TeamRecordGrant[0].teamId='team-b';await expect(revokeRecord('team-a','viewer','grant-a')).rejects.toThrow();
  });
});
