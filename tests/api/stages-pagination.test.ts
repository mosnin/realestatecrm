import { expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({fail:false,queries:[] as any[]}));
vi.mock('@/lib/api-auth',()=>({requireSpaceOwner:async()=>({space:{id:'space'}})}));
vi.mock('@/lib/logger',()=>({logger:{error:vi.fn()}}));
vi.mock('@/lib/supabase',()=>({supabase:{from:(table:string)=>chain(table)}}));
vi.mock('@/lib/tenant-db',()=>({tenantTable:(_:unknown,table:string,scope:unknown)=>{state.queries.push({table,scope});return chain(table);}}));
function chain(table:string):any {
 let from=0,to=999;const filters:Record<string,any>={};
 const q:any={select:()=>q,eq:(k:string,v:any)=>{filters[k]=v;return q;},in:(k:string,v:any)=>{filters[k]=v;return q;},order:()=>q,range:(a:number,b:number)=>{from=a;to=b;return q;},then:(resolve:any)=>{
  state.queries.push({table,from,to,filters});
  let rows:any[]=table==='DealStage'?[{id:'stage'}]:table==='Deal'?Array.from({length:1101},(_,id)=>({id:`deal${id}`,stageId:'stage'})):table==='DealChecklistItem'?Array.from({length:1101},(_,id)=>({dealId:'deal1100',kind:'inspection',label:'Inspection',completedAt:id===1100?'2026-09-01':null})):[];
  if(table==='DealChecklistItem'&&!filters.dealId?.includes('deal1100'))rows=[];
  return Promise.resolve({data:state.fail&&table==='DealChecklistItem'&&from===1000?null:rows.slice(from,to+1),error:state.fail&&table==='DealChecklistItem'&&from===1000?new Error('later page failed'):null}).then(resolve);
 }};return q;
}
import { GET } from '@/app/api/stages/route';
beforeEach(()=>{state.fail=false;state.queries=[];});
it('returns deals and completion evidence beyond the provider first page',async()=>{
 const response=await GET(new NextRequest('http://localhost/api/stages?slug=test&pipelineId=p'));
 expect(response.status).toBe(200);const stages=await response.json();
 expect(stages[0].deals).toHaveLength(1101);
 expect(stages[0].deals[1100].checklist).toHaveLength(1101);
 expect(stages[0].deals[1100].checklist[1100].completedAt).toBe('2026-09-01');
 expect(state.queries.filter(q=>q.scope).every(q=>q.scope.spaceId==='space')).toBe(true);
});
it('fails visibly when a later checklist page fails',async()=>{
 state.fail=true;const response=await GET(new NextRequest('http://localhost/api/stages?slug=test&pipelineId=p'));
 expect(response.status).toBe(500);
});
