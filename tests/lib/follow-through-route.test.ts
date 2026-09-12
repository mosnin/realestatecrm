import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), create: vi.fn(), list: vi.fn(), table: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: mocks.auth }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/lib/tenant-db', () => ({ tenantTable: mocks.table }));
vi.mock('@/lib/follow-through/service', async (original) => ({ ...await original<object>(), createCommitment: mocks.create, listCommitments: mocks.list }));
import { GET, POST, PATCH } from '@/app/api/follow-through/route';
const commitment = { id: '11111111-1111-4111-8111-111111111111', contactId: 'client', title: 'Confirm inspection', instruction: 'Confirm the access arrangements', dueAt: '2026-09-10T10:00:00.000Z', kind: 'handoff', channel: null };
const request = (method: string, body?: unknown) => new NextRequest('http://localhost/api/follow-through?slug=mine', { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: 'owner', space: { id: 'tenant' } }); });
describe('Client work API authority', () => {
  it('does not read or mutate data for unauthorized requests', async () => {
    mocks.auth.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect((await GET(request('GET'))).status).toBe(403);
    expect((await POST(request('POST', { slug: 'mine', commitment }))).status).toBe(403);
    expect((await PATCH(request('PATCH', { slug: 'mine', id: commitment.id, action: 'cancel' }))).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.table).not.toHaveBeenCalled();
  });
  it('uses the authorized workspace for creation, never a caller-supplied scope', async () => {
    mocks.create.mockResolvedValue(commitment.id);
    expect((await POST(request('POST', { slug: 'mine', commitment }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith('tenant', commitment);
    expect((await POST(request('POST', { slug: 'mine', spaceId: 'victim', commitment }))).status).toBe(400);
  });
  it('surfaces a cancellation rejected after delivery has started', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Delivery already started' } });
    const res = await PATCH(request('PATCH', { slug: 'mine', id: commitment.id, action: 'cancel' }));
    expect(res.status).toBe(409); expect(await res.json()).toEqual({ error: 'Delivery already started' });
    expect(mocks.rpc).toHaveBeenCalledWith('change_client_commitment', expect.objectContaining({ p_space_id: 'tenant' }));
  });
});
