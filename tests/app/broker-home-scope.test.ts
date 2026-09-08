import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
const state=vi.hoisted(()=>({selected:'broker-a'}));
vi.mock('@/lib/permissions', () => ({ activeBrokerageId: async () => state.selected, getBrokerMemberContext: async () => ({brokerage:{id:'broker-b'}}) }));
import BrokerHomePage from '@/app/broker/page';
describe('brokerage landing redirects', () => {
  it('resolves an explicit recovery before redirecting', async () => {
    state.selected='';
    try { await expect(BrokerHomePage({searchParams:Promise.resolve({})})).rejects.toThrow('redirect:/broker/brief?brokerage=broker-b'); }
    finally {state.selected='broker-a';}
  });
  it('retains the selected brokerage when opening Today', async () => {
    await expect(BrokerHomePage({searchParams:Promise.resolve({})})).rejects.toThrow('redirect:/broker/brief?brokerage=broker-a');
  });
  it('retains both legacy chat context and the selected brokerage', async () => {
    await expect(BrokerHomePage({searchParams:Promise.resolve({conversationId:'conversation-a'})})).rejects.toThrow('redirect:/broker/chippi?conversationId=conversation-a&brokerage=broker-a');
  });
});
