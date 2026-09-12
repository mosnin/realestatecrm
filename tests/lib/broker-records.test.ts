import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ broker: vi.fn(), members: vi.fn(), rows: [] as Record<string,unknown>[] }));
vi.mock('@/lib/permissions', () => ({ requireBroker: state.broker }));
vi.mock('@/lib/brokerage-members', () => ({ getBrokerageMembers: state.members }));
vi.mock('@/lib/supabase', () => ({supabase:{from: (table:string) => {
  const filters: Array<(row:Record<string,unknown>)=>boolean> = [];
  const chain = { select:()=>chain, eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return chain;}, in:(key:string,values:unknown[])=>{filters.push(row=>values.includes(row[key]));return chain;}, maybeSingle:async()=>({data:state.rows.find(row=>row.table===table&&filters.every(f=>f(row)))??null,error:null}), then:(resolve:(result:unknown)=>unknown)=>Promise.resolve({data:state.rows.filter(row=>row.table===table&&filters.every(f=>f(row))),error:null}).then(resolve) };
  return chain;
}}}));
import { getBrokerRecord } from '@/lib/broker-records';
describe('broker record authority', () => {
  beforeEach(()=>{state.broker.mockResolvedValue({brokerage:{id:'broker-a',ownerId:'owner-a'}});state.members.mockResolvedValue([{Space:{id:'space-a'}}]);state.rows=[];});
  it('opens an exact contact ID in an authorized member space', async()=>{
    state.rows=[{table:'Contact',id:'one',name:'Same name',spaceId:'space-a'},{table:'Contact',id:'two',name:'Same name',spaceId:'space-a'}];
    expect((await getBrokerRecord('people','two'))?.id).toBe('two');
  });
  it('does not return a guessed contact or deal from another space',async()=>{
    state.rows=[{table:'Contact',id:'foreign',spaceId:'space-b'},{table:'Deal',id:'foreign',spaceId:'space-b'}];
    expect(await getBrokerRecord('people','foreign')).toBeNull();
    expect(await getBrokerRecord('deals','foreign')).toBeNull();
  });
  it('checks property brokerage, even when its owner has another accessible workspace', async()=>{
    state.rows=[{table:'Property',id:'foreign',spaceId:'space-a',brokerageId:'broker-b'}];
    expect(await getBrokerRecord('properties','foreign')).toBeNull();
  });
  it('fails closed on membership errors and revoked broker access',async()=>{
    state.members.mockRejectedValueOnce(new Error('Membership unavailable'));
    await expect(getBrokerRecord('people','one')).rejects.toThrow('Membership unavailable');
    state.broker.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(getBrokerRecord('people','one')).rejects.toThrow('Forbidden');
  });
});
