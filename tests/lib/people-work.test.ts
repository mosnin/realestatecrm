import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(()=>({ commitments:[] as any[], receipts:[] as any[], fail:false }));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/lib/tenant-db',()=>({tenantTable:(_db:unknown,table:string,{spaceId}:{spaceId:string})=>{
 const matches:((r:any)=>boolean)[]=[r=>r.spaceId===spaceId];
 let from=0,to=999;
 const chain={select:()=>chain,in:(key:string,values:string[])=>{matches.push(r=>values.includes(r[key]));return chain;},order:()=>chain,range:(a:number,b:number)=>{from=a;to=b;return chain;},then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data:(table==='ClientCommitment'?state.commitments:state.receipts).filter(r=>matches.every(f=>f(r))).slice(from,to+1),error:state.fail?{message:'unavailable'}:null}).then(resolve)};return chain;
}}));
import { attachPeopleWork, peopleWork } from '@/lib/people-work';
describe('People execution evidence',()=>{
 beforeEach(()=>{state.fail=false;state.receipts=[];state.commitments=[{id:'c1',spaceId:'s1',contactId:'p1',title:'Call back',status:'open',dueAt:'2026-01-01',scheduledMessageId:'m1'}];});
 it('does not turn a draft or failed delivery into completed work',async()=>{
   for(const status of ['drafted','failed']){state.receipts=[{id:'m1',spaceId:'s1',status}];expect((await peopleWork('s1',['p1'])).get('p1')).toMatchObject({label:'Needs attention',requiresAttention:true});}
 });
 it('does not ask for a completed delivery again',async()=>{state.receipts=[{id:'m1',spaceId:'s1',status:'sent'}];expect((await peopleWork('s1',['p1'])).size).toBe(0);});
 it('does not read another workspace receipt',async()=>{state.receipts=[{id:'m1',spaceId:'s2',status:'sent'}];expect((await peopleWork('s1',['p1'])).get('p1')?.label).toBe('Delivery unavailable');});
 it('keeps contacts visible but marks missing work data unavailable',async()=>{state.fail=true;expect(await attachPeopleWork([{id:'p1',spaceId:'s1'}])).toEqual([{id:'p1',spaceId:'s1',work:null,workUnavailable:true}]);});
});
