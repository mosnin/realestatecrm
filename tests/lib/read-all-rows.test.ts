import { expect, it } from 'vitest';
import { readAllRows } from '@/lib/read-all-rows';
it('includes a high-priority record past the first 500 among 1200 records',async()=>{
 const records=Array.from({length:1200},(_,id)=>({id,priority:id===1100}));const pages:number[]=[];
 const all=await readAllRows(async(from,to)=>{pages.push(from);return{data:records.slice(from,to+1),error:null};});
 expect(all).toHaveLength(1200);expect(all.find(row=>row.priority)?.id).toBe(1100);expect(pages).toEqual([0,500,1000]);
});
it('does not turn a later page failure into a partial complete list',async()=>{
 await expect(readAllRows(async(from)=>({data:from?null:Array.from({length:500},()=>1),error:from?new Error('unavailable'):null}))).rejects.toThrow('unavailable');
});
