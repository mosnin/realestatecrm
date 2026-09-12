import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({batchSizes:[] as number[]}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
vi.mock('@/lib/tenant-db',()=>({tenantTable:(_:unknown,table:string,scope:any)=>{
 let from=0,to=999,ids:string[]=[],statuses:string[]=[];
 const q:any={select:()=>q,order:()=>q,limit:()=>q,range:(a:number,b:number)=>{from=a;to=b;return q;},in:(key:string,value:string[])=>{if(key==='status')statuses=value;else ids=value;return q;},then:(resolve:any)=>{
  if(scope.spaceId!=='s')throw new Error('Wrong scope');
  if(table==='ScheduledMessage'){state.batchSizes.push(ids.length);return Promise.resolve({data:ids.map(id=>({id,status:'sent',detail:null})),error:null}).then(resolve);}
  const rows=statuses.includes('open')?Array.from({length:501},(_,i)=>({id:String(i),scheduledMessageId:`receipt${i}`,status:'open',dueAt:'2026-09-07'})):[];
  return Promise.resolve({data:rows.slice(from,to+1),error:null}).then(resolve);
 }};return q;
}}));
import {listCommitments} from '@/lib/follow-through/service';
it('returns all unfinished commitments and batches their delivery receipts',async()=>{
 const rows=await listCommitments('s');expect(rows).toHaveLength(501);expect(rows[500].delivery?.status).toBe('sent');expect(Math.max(...state.batchSizes)).toBe(100);
});
