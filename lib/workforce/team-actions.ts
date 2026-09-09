import 'server-only';
import {z} from 'zod';
import type {WorkforcePrincipal} from '@/integrations/cadre/packages/core/src/node/workforce-auth';
import {createTeamWork,updateTeamWork,workItemInput,workItemUpdate} from '@/lib/teams/work-items';
import {editSharedRecord,refreshEditedRecordIndex} from '@/lib/teams/record-edits';
import {recordEditRequest} from '@/lib/teams/record-edit-policy';
import {audit} from '@/lib/audit';
import {after} from 'next/server';
const create=workItemInput.extend({requestId:z.string().uuid()}).strict();
const catalog=[
 {name:'create_team_work',description:'Assign an actionable next step with an owner and due date. Members may assign themselves; managers may delegate. Choose one UUID requestId per assignment and reuse it on retry.',schema:create},
 {name:'update_team_work',description:'Acknowledge, complete, cancel or reassign existing team work using its current id and version. Only the assignee may acknowledge or complete; completion requires acknowledgment. Managers may reassign. Refresh after version conflicts; never claim completion without a receipt.',schema:workItemUpdate},
 {name:'edit_shared_record',description:'Edit only explicitly delegated fields on a shared record. Use its grantId, source, revision and a unique requestId; reuse the same requestId and changes on retry. Private notes, deal stage and listing status are not delegated.',schema:recordEditRequest},
];
export async function executeTeamAction(principal:WorkforcePrincipal,clerkId:string,input:{operation?:string;tool?:string;args?:unknown;spaceId?:string},signal:AbortSignal) {
 if(process.env.CHIPPI_TEAM_CRM_ENABLED!=='true'||process.env.CHIPPI_TEAM_ACTIONS_ENABLED!=='true'||principal.kind!=='team'||input.spaceId)throw new Error('Team actions unavailable');
 const available=catalog.filter(tool=>tool.name!=='edit_shared_record'||process.env.CHIPPI_TEAM_RECORD_EDITS_ENABLED==='true');
 if(input.operation==='action_catalog')return {tools:available.map(({schema,...tool})=>({...tool,parameters:z.toJSONSchema(schema,{io:'input'})}))};
 if(input.operation!=='action'||!available.some(tool=>tool.name===input.tool))throw new Error('Unsupported team action');
 signal.throwIfAborted();
 const teamId=principal.scopeId,actorId=principal.actorId;
 if(input.tool==='edit_shared_record'){
  const receipt=await editSharedRecord(teamId,actorId,recordEditRequest.parse(input.args));
  const refresh=refreshEditedRecordIndex(receipt).catch(error=>console.error('[team-actions] index refresh failed',error));after(()=>refresh);
  await audit({actorClerkId:clerkId,action:'UPDATE',resource:'TeamRecordEdit',resourceId:receipt.id,metadata:{teamId,execution:'agent',recordId:receipt.recordId}});
  return {receipt};
 }
 const item=input.tool==='create_team_work'?await createTeamWork(teamId,actorId,create.parse(input.args)):await updateTeamWork(teamId,actorId,workItemUpdate.parse(input.args));
 await audit({actorClerkId:clerkId,action:input.tool==='create_team_work'?'CREATE':'UPDATE',resource:'TeamWorkItem',resourceId:item.id,metadata:{teamId,execution:'agent'}});
 return {item};
}
