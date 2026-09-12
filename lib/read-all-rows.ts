/** Follow explicit pages; never silently report a provider's first-page cap as a total. */
export async function readAllRows<T>(page: (from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>, size=500):Promise<T[]> {
  if (!Number.isInteger(size) || size < 1) throw new Error('Invalid page size');
  const rows:T[]=[];
  for(let offset=0;;offset+=size){
    const result=await page(offset,offset+size-1);
    if(result.error) throw result.error;
    rows.push(...(result.data??[]));
    if(!result.data || result.data.length<size) return rows;
  }
}
