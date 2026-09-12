import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { teamAccess, teamPeople, type TeamRole } from './server';

export const workItemInput = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000).default(''), assignedTo: z.string().min(1).max(150), dueAt: z.string().datetime({offset:true}), requestId:z.string().uuid().optional() }).strict();
export const workItemUpdate = z.object({ id: z.string().uuid(), version: z.number().int().positive(), action: z.enum(['accept','complete','cancel','reassign']), assignedTo: z.string().min(1).max(150).optional() }).strict();
export type TeamWorkItem = { id:string; teamId:string; createdBy:string; assignedTo:string; title:string; description:string; dueAt:string; status:'assigned'|'accepted'|'done'|'cancelled'; version:number; acknowledgedAt:string|null; completedAt:string|null };
const table = (teamId:string) => tenantTable(supabase,'TeamWorkItem',{teamId});
const fields = 'id, teamId, createdBy, assignedTo, title, description, dueAt, status, version, acknowledgedAt, completedAt';

async function activeMember(teamId:string,userId:string) {
  await teamAccess(teamId,userId);
  const {data,error} = await supabase.from('User').select('id, status, platformRole').eq('id',userId).maybeSingle();
  if(error || !data || data.status==='offboarded' || data.platformRole==='banned') throw new Error('Assignee unavailable');
}

export function transitionWorkItem(item:TeamWorkItem, actorId:string, role:TeamRole, input:z.infer<typeof workItemUpdate>) {
  if(item.version!==input.version || ['done','cancelled'].includes(item.status)) throw new Error('Work changed. Refresh and try again.');
  const manager = role==='owner'||role==='admin';
  const assigned = item.assignedTo===actorId;
  if(input.action==='reassign') {
    if(!manager || !input.assignedTo) throw new Error('Only team managers can reassign work');
    return {assignedTo:input.assignedTo,status:'assigned',acknowledgedAt:null,completedAt:null};
  }
  if(input.action==='cancel') {
    if(!manager && item.createdBy!==actorId) throw new Error('Only the creator or a manager can cancel work');
    return {status:'cancelled'};
  }
  if(!assigned) throw new Error('Only the assignee can acknowledge or complete work');
  if(input.action==='accept') {
    if(item.status!=='assigned') throw new Error('Work already acknowledged');
    return {status:'accepted',acknowledgedAt:new Date().toISOString()};
  }
  if(item.status!=='accepted') throw new Error('Acknowledge the handoff before completing work');
  return {status:'done',completedAt:new Date().toISOString()};
}

export async function listTeamWork(teamId:string,actorId:string,offset=0,closed=false) {
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000||typeof closed!=='boolean')throw new Error('Invalid work view');
  await activeMember(teamId,actorId);
  const access=await teamAccess(teamId,actorId);
  const {data,error}=await table(teamId).select(fields).in('status',closed?['done','cancelled']:['assigned','accepted']).order('dueAt').order('id').range(offset,offset+49);
  if(error) throw new Error('Team work could not be loaded');
  const people=await teamPeople(teamId,actorId);
  return {items:(data??[]) as TeamWorkItem[], role:access.role,actorId,people,nextOffset:data?.length===50?offset+50:null};
}
export async function createTeamWork(teamId:string,actorId:string,input:z.infer<typeof workItemInput>) {
  input=workItemInput.parse(input);
  await activeMember(teamId,actorId);
  const {role}=await teamAccess(teamId,actorId);
  if(role==='member' && input.assignedTo!==actorId) throw new Error('Only team managers can assign work to someone else');
  await activeMember(teamId,input.assignedTo);
  const {requestId,...details}=input;
  const {data,error}=await table(teamId).insert({id:requestId??randomUUID(),teamId,createdBy:actorId,...details}).select(fields).single();
  if(error?.code==='23505'&&requestId){
    const previous=await table(teamId).select(fields).eq('id',requestId).eq('createdBy',actorId).maybeSingle();
    const item=previous.data;
    if(!previous.error&&item&&item.title===details.title&&item.description===details.description&&item.assignedTo===details.assignedTo&&Date.parse(item.dueAt)===Date.parse(details.dueAt))return item;
    throw new Error('Request changed. Refresh before assigning work again.');
  }
  if(error||!data) throw new Error('Work could not be saved');
  return data;
}
export async function updateTeamWork(teamId:string,actorId:string,input:z.infer<typeof workItemUpdate>) {
  input=workItemUpdate.parse(input);
  await activeMember(teamId,actorId);
  const {role}=await teamAccess(teamId,actorId);
  const {data,error}=await table(teamId).select(fields).eq('id',input.id).maybeSingle();
  if(error || !data) throw new Error('Work unavailable');
  const patch=transitionWorkItem(data,actorId,role,input);
  if(input.action==='reassign') await activeMember(teamId,input.assignedTo!);
  const result=await table(teamId).update({...patch,version:input.version+1,updatedAt:new Date().toISOString()}).eq('id',input.id).eq('version',input.version).select(fields).maybeSingle();
  if(result.error || !result.data) throw new Error('Work changed. Refresh and try again.');
  return result.data;
}

/** Deadline-driven attention; resolved work disappears without a background-job race. */
export async function teamWorkAttention(teamId:string,actorId:string) {
  await activeMember(teamId,actorId);
  const {role}=await teamAccess(teamId,actorId);
  let query=table(teamId).select('id',{count:'exact',head:true}).in('status',['assigned','accepted']).lt('dueAt',new Date().toISOString());
  if(role==='member')query=query.eq('assignedTo',actorId);
  const {count,error}=await query;
  if(error||count===null)throw new Error('Team attention unavailable');
  return {overdue:count,manager:role!=='member'};
}
