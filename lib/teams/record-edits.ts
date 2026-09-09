import 'server-only';
import {supabase} from '@/lib/supabase';
import {recordEditRequest} from './record-edit-policy';
import {teamAccess} from './server';
import {z} from 'zod';
import {tenantTable} from '@/lib/tenant-db';
import {syncContact,syncDeal} from '@/lib/vectorize';
export class TeamRecordEditError extends Error {
  constructor(public readonly status:number,message:string){super(message);}
}
export async function editSharedRecord(teamId:string,actorId:string,input:z.infer<typeof recordEditRequest>) {
  if(process.env.CHIPPI_TEAM_RECORD_EDITS_ENABLED!=='true'||(input.source==='brokerage'&&process.env.CHIPPI_BROKERAGE_TEAM_SHARING_ENABLED!=='true'))throw new TeamRecordEditError(404,'Team editing is not enabled');
  await teamAccess(teamId,actorId);
  const parsed=recordEditRequest.parse(input);
  const {data,error}=await supabase.rpc('edit_team_shared_record',{p_team_id:teamId,p_actor_id:actorId,p_grant_id:parsed.grantId,p_source:parsed.source,p_request_id:parsed.requestId,p_expected_updated_at:parsed.revision,p_changes:parsed.changes});
  if(error){
    if(error.code==='42501')throw new TeamRecordEditError(403,'Editing access changed. Refresh this record.');
    if(['40001','23505'].includes(error.code))throw new TeamRecordEditError(409,'This record changed. Refresh before saving your edit.');
    if(['22023','22007','22P02','22003','23502','23514'].includes(error.code))throw new TeamRecordEditError(400,'Check the field values and try again.');
    throw new TeamRecordEditError(503,'The edit could not be confirmed. Retry with the same request.');
  }
  if(!data)throw new TeamRecordEditError(503,'The edit could not be confirmed. Retry with the same request.');
  return data as {id:string;recordKind:'contact'|'deal'|'property';recordId:string;spaceId:string|null;updatedAt:string};
}

/** Refresh the original workspace index, never copy private source data into a team index. */
export async function refreshEditedRecordIndex(receipt:Awaited<ReturnType<typeof editSharedRecord>>) {
  if(!receipt.spaceId||receipt.recordKind==='property')return;
  const table=receipt.recordKind==='contact'?'Contact':'Deal';
  const {data,error}=await tenantTable(supabase,table,{spaceId:receipt.spaceId}).select('*').eq('id',receipt.recordId).maybeSingle();
  if(error)throw new Error('Edited record index refresh unavailable');
  if(!data)return;
  if(receipt.recordKind==='contact')await syncContact(data);
  else await syncDeal(data);
}
