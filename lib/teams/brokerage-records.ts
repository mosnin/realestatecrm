import 'server-only';
import {supabase} from '@/lib/supabase';
import {tenantTable} from '@/lib/tenant-db';
import {unscoped} from '@/lib/supabase-guard';
import {teamAccess} from './server';
import {SHARED_RECORD_FIELDS,type RecordKind} from './record-fields';
import type {SharedRecord} from './shared-records';

const editingEnabled=()=>process.env.CHIPPI_TEAM_RECORD_EDITS_ENABLED==='true';
function enabled(){return process.env.CHIPPI_BROKERAGE_TEAM_SHARING_ENABLED==='true';}
function requireEnabled(){if(!enabled())throw new Error('Brokerage team sharing is not enabled');}

async function manager(brokerageId:string,actorId:string) {
  const {data,error}=await tenantTable(supabase,'BrokerageMembership',{brokerageId}).select('role').eq('userId',actorId).maybeSingle();
  if(error)throw new Error('Brokerage authority unavailable');
  return Boolean(data&&['broker_owner','broker_admin'].includes(data.role));
}
function recordQuery(brokerageId:string,kind:RecordKind) {
  const policy=SHARED_RECORD_FIELDS[kind];
  if(!policy)throw new Error('Unsupported record type');
  // Contacts/properties can have nullable spaceId. Deals inherit brokerage
  // scope through their Space FK. Neither path treats assignment as ownership.
  const query=unscoped(supabase.from(policy.table),'explicit brokerage grant and current team membership checked; record query binds brokerage ownership').select(policy.columns+(editingEnabled()?', updatedAt':'')+(kind==='deal'?', Space!inner(brokerageId)':''));
  return kind==='deal'?query.eq('Space.brokerageId',brokerageId):query.eq('brokerageId',brokerageId);
}
function allowedFields(kind:RecordKind,record:Record<string,unknown>) {
  return Object.fromEntries(SHARED_RECORD_FIELDS[kind].columns.split(', ').map(key=>[key,record[key]??null]));
}
export async function brokerageSharingAvailable(teamId:string,actorId:string) {
  if(!enabled())return false;
  const {team}=await teamAccess(teamId,actorId);
  return team.parentKind==='brokerage'&&await manager(team.parentRouteId,actorId);
}
export async function brokerageCandidates(teamId:string,actorId:string,input:{kind:RecordKind;offset?:number;search?:string}) {
  requireEnabled();
  const {team}=await teamAccess(teamId,actorId);
  if(team.parentKind!=='brokerage'||!await manager(team.parentRouteId,actorId))throw new Error('Only brokerage managers can share brokerage records');
  const offset=input.offset??0;
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new Error('Invalid page');
  let query=recordQuery(team.parentRouteId,input.kind);
  if(input.search?.trim())query=query.ilike(SHARED_RECORD_FIELDS[input.kind].title,`%${input.search.trim().replace(/[\\%_]/g,'\\$&')}%`);
  const {data,error}=await query.order(SHARED_RECORD_FIELDS[input.kind].title).order('id').range(offset,offset+24);
  if(error)throw new Error('Brokerage records unavailable');
  return {spaces:[],spaceId:null,records:(data??[]).map(row=>allowedFields(input.kind,row as unknown as Record<string,unknown>)),nextOffset:data?.length===25?offset+25:null};
}
export async function shareBrokerageRecord(teamId:string,actorId:string,input:{kind:RecordKind;recordId:string;allowEdits?:boolean}) {
  requireEnabled();
  const {team}=await teamAccess(teamId,actorId);
  if(team.parentKind!=='brokerage'||!await manager(team.parentRouteId,actorId))throw new Error('Only brokerage managers can share brokerage records');
  if(input.allowEdits&&!editingEnabled())throw new Error('Team editing is not enabled');
  const record=await recordQuery(team.parentRouteId,input.kind).eq('id',input.recordId).maybeSingle();
  if(record.error||!record.data)throw new Error('Brokerage record unavailable');
  const {data,error}=await tenantTable(supabase,'BrokerageTeamRecordGrant',{brokerageId:team.parentRouteId}).upsert({teamId,brokerageId:team.parentRouteId,recordKind:input.kind,recordId:input.recordId,grantedBy:actorId,...(editingEnabled()?{canEdit:input.allowEdits??false}:{}),revokedAt:null,createdAt:new Date().toISOString()},{onConflict:'teamId,brokerageId,recordKind,recordId'}).select('id').single();
  if(error)throw new Error('Brokerage record could not be shared');
  return {id:data.id,brokerageId:team.parentRouteId};
}
export async function revokeBrokerageRecord(teamId:string,actorId:string,grantId:string) {
  requireEnabled();
  const {team,role}=await teamAccess(teamId,actorId);
  if(team.parentKind!=='brokerage')throw new Error('Share unavailable');
  const table=()=>tenantTable(supabase,'BrokerageTeamRecordGrant',{brokerageId:team.parentRouteId});
  const grant=await table().select('id, grantedBy').eq('teamId',teamId).eq('id',grantId).maybeSingle();
  if(grant.error||!grant.data)throw new Error('Share unavailable');
  if(grant.data.grantedBy!==actorId&&role!=='owner'&&!await manager(team.parentRouteId,actorId))throw new Error('Sharing authority unavailable');
  const result=await table().update({revokedAt:new Date().toISOString()}).eq('teamId',teamId).eq('id',grantId);
  if(result.error)throw new Error('Sharing could not be stopped');
  return {brokerageId:team.parentRouteId};
}
export async function listBrokerageRecords(teamId:string,actorId:string,input:{offset?:number;kind?:RecordKind}={}) {
  if(!enabled())return {records:[] as SharedRecord[],nextOffset:null};
  const {team,role}=await teamAccess(teamId,actorId);
  if(team.parentKind!=='brokerage')return {records:[] as SharedRecord[],nextOffset:null};
  const offset=input.offset??0;
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new Error('Invalid page');
  let query=tenantTable(supabase,'BrokerageTeamRecordGrant',{brokerageId:team.parentRouteId}).select('id, recordKind, recordId, grantedBy'+(editingEnabled()?', canEdit':'')).eq('teamId',teamId).is('revokedAt',null);
  if(input.kind)query=query.eq('recordKind',input.kind);
  const {data,error}=await query.order('createdAt',{ascending:false}).order('id').range(offset,offset+24);
  if(error)throw new Error('Brokerage shares unavailable');
  const viewerManager=await manager(team.parentRouteId,actorId);
  const authority=new Map<string,boolean>();
  const records:SharedRecord[]=[];
  for(const grant of data??[]) {
    if(!authority.has(grant.grantedBy)) {
      const user=await supabase.from('User').select('id, status, platformRole').eq('id',grant.grantedBy).maybeSingle();
      if(user.error)throw new Error('Sharing authority unavailable');
      let member=true;
      if(team.ownerId!==grant.grantedBy) {
        const membership=await unscoped(supabase.from('CollaborationTeamMember'),'verify brokerage grantor remains in the explicitly shared team').select('role, revokedAt').eq('teamId',teamId).eq('userId',grant.grantedBy).maybeSingle();
        if(membership.error)throw new Error('Sharing authority unavailable');
        member=Boolean(membership.data&&!membership.data.revokedAt&&['admin','member'].includes(membership.data.role));
      }
      authority.set(grant.grantedBy,member&&Boolean(user.data&&user.data.status!=='offboarded'&&user.data.platformRole!=='banned')&&await manager(team.parentRouteId,grant.grantedBy));
    }
    if(!authority.get(grant.grantedBy))continue;
    const kind=grant.recordKind as RecordKind;
    const record=await recordQuery(team.parentRouteId,kind).eq('id',grant.recordId).maybeSingle();
    if(record.error)throw new Error('Brokerage record unavailable');
    if(!record.data)continue;
    const fields=allowedFields(kind,record.data as unknown as Record<string,unknown>);delete fields.id;
    records.push({grantId:grant.id,kind,title:String(fields[SHARED_RECORD_FIELDS[kind].title]??'Untitled'),fields,source:'brokerage',canRevoke:viewerManager||role==='owner'||grant.grantedBy===actorId,...(editingEnabled()&&grant.canEdit&&typeof (record.data as any).updatedAt==='string'?{canEdit:true,revision:(record.data as any).updatedAt}:{})});
  }
  return {records,nextOffset:data?.length===25?offset+25:null};
}
