/**
 * Messaging route guards — the access boundaries that keep brokerage messaging
 * safe: you can only DM real teammates (not yourself, not outsiders), and only
 * owners/admins create channels. The data layer is mocked; these assert the
 * gate logic in the routes themselves.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const ctx = {
  brokerage: { id: 'bk_1', name: 'Acme Realty' },
  membership: { id: 'mem_1', role: 'realtor_member' as string, displayName: null },
  dbUserId: 'u_1',
};

vi.mock('@/lib/permissions', () => ({
  getBrokerMemberContext: vi.fn(async () => ctx),
  // Real semantics: only owners/admins manage (create channels).
  canManageRoles: (role: string) => role === 'broker_owner' || role === 'broker_admin',
}));

const ensureDmChannel = vi.fn(async () => ({ channel: { id: 'c_dm', kind: 'dm' }, created: true }));
const createNamedChannel = vi.fn(async () => ({ id: 'c_new', kind: 'channel' }));
const rosterForBrokerage = vi.fn(async () => [
  { userId: 'u_1', name: 'Me', email: 'me@x.com', avatar: null, role: 'realtor_member', lastSeenAt: null },
  { userId: 'u_2', name: 'Teammate', email: 't@x.com', avatar: null, role: 'realtor_member', lastSeenAt: null },
]);

vi.mock('@/lib/messaging', () => ({
  ensureDmChannel: (...a: unknown[]) => ensureDmChannel(...(a as [])),
  createNamedChannel: (...a: unknown[]) => createNamedChannel(...(a as [])),
  rosterForBrokerage: (...a: unknown[]) => rosterForBrokerage(...(a as [])),
  listChannels: vi.fn(async () => []),
}));

vi.mock('@/lib/realtime/ably', () => ({
  publishUserEvent: vi.fn(),
}));

import { POST as dmPost } from '@/app/api/messages/dm/route';
import { POST as channelsPost } from '@/app/api/messages/channels/route';

function jsonReq(body: unknown) {
  return new Request('http://t/api/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  ctx.membership.role = 'realtor_member';
  ensureDmChannel.mockClear();
  createNamedChannel.mockClear();
});

describe('POST /api/messages/dm', () => {
  it('opens a DM with a real teammate', async () => {
    const res = await dmPost(jsonReq({ userId: 'u_2' }));
    expect(res.status).toBe(201);
    expect(ensureDmChannel).toHaveBeenCalledOnce();
  });

  it('rejects DMing yourself', async () => {
    const res = await dmPost(jsonReq({ userId: 'u_1' }));
    expect(res.status).toBe(400);
    expect(ensureDmChannel).not.toHaveBeenCalled();
  });

  it('rejects DMing someone outside the brokerage', async () => {
    const res = await dmPost(jsonReq({ userId: 'u_outsider' }));
    expect(res.status).toBe(404);
    expect(ensureDmChannel).not.toHaveBeenCalled();
  });

  it('requires a userId', async () => {
    const res = await dmPost(jsonReq({}));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/messages/channels', () => {
  it('lets an admin create a channel', async () => {
    ctx.membership.role = 'broker_admin';
    const res = await channelsPost(jsonReq({ name: 'deals-desk' }));
    expect(res.status).toBe(201);
    expect(createNamedChannel).toHaveBeenCalledOnce();
  });

  it('forbids a realtor member from creating a channel', async () => {
    ctx.membership.role = 'realtor_member';
    const res = await channelsPost(jsonReq({ name: 'deals-desk' }));
    expect(res.status).toBe(403);
    expect(createNamedChannel).not.toHaveBeenCalled();
  });

  it('requires a channel name', async () => {
    ctx.membership.role = 'broker_owner';
    const res = await channelsPost(jsonReq({ name: '   ' }));
    expect(res.status).toBe(400);
  });
});
