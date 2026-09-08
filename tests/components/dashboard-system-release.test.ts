import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
const permissionState=vi.hoisted(()=>({revoked:false}));
vi.mock('@/lib/permissions', () => ({ getBrokerMemberContext: async () => permissionState.revoked ? null : ({ brokerage:{id:'broker-a'},membership:{role:'realtor_member'} }) }));
vi.mock('@/lib/supabase', () => ({ supabase:{} }));
vi.mock('@/components/chippi/chippi-workspace', () => ({ ChippiWorkspace: () => null }));
import PersonalHome from '@/app/s/[slug]/page';
import BrokerChat from '@/app/broker/chippi/page';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Today dashboard system release contract', () => {
  it('makes Today the personal default', async () => {
    await expect(PersonalHome({params:Promise.resolve({slug:'alex'})})).rejects.toThrow('redirect:/s/alex/chippi/brief');
  });

  it('redirects members from broker chat to Today in the same brokerage', async () => {
    await expect(BrokerChat({searchParams:Promise.resolve({})})).rejects.toThrow('redirect:/broker/brief?brokerage=broker-a');
  });

  it('opens recovery when the selected brokerage is unavailable', async () => {
    permissionState.revoked=true;
    try { await expect(BrokerChat({searchParams:Promise.resolve({})})).rejects.toThrow('redirect:/workspace-unavailable'); }
    finally {permissionState.revoked=false;}
  });

  it('applies the canonical warm Today canvas to realtor and broker dashboard shells', () => {
    const realtorShell = read('components/dashboard/layout-shell.tsx');
    const brokerShell = read('components/broker/broker-main.tsx');
    const globals = read('app/globals.css');

    for (const source of [realtorShell, brokerShell]) {
      expect(source).toContain('data-premium-dashboard');
      expect(source).toContain('chippi-dashboard-canvas');
    }
    expect(globals).toContain("[data-premium-dashboard] [data-slot='card']");
    expect(globals).toContain('border-radius: 1.75rem');
  });

});
