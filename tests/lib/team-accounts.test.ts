import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { state, calls } = vi.hoisted(() => ({ state: {} as Record<string, unknown>, calls: [] as unknown[][] }));
vi.mock('@/lib/supabase-guard', () => ({ unscoped: (q: unknown) => q }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  const result = () => ({ data: state[table] ?? null, error: state[`${table}Error`] ?? null });
  const q = {
    select: () => q, order: () => q, limit: () => q, is: () => q,
    eq: (key: string, value: unknown) => { calls.push([table, 'eq', key, value]); return q; },
    gt: (key: string, value: unknown) => { calls.push([table, 'gt', key, value]); return q; },
    update: (value: unknown) => { calls.push([table, 'update', value]); return q; },
    insert: (value: unknown) => { calls.push([table, 'insert', value]); return q; },
    upsert: (value: unknown, options: unknown) => { calls.push([table, 'upsert', value, options]); return q; },
    delete: () => { calls.push([table, 'delete']); return q; },
    maybeSingle: async () => result(), single: async () => result(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  }; return q;
} } }));
import { teamAccess, inviteTeam, joinTeam, changeTeamMember, teamUser } from '@/lib/teams/server';
beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key];
  calls.length = 0;
  state.CollaborationTeam = { id: 'team-a', ownerId: 'owner', name: 'Team A' };
  state.CollaborationTeamMember = { role: 'member' };
});
describe('collaborative team authority', () => {
  it('derives owner authority from the team, not a supplied role', async () => {
    expect((await teamAccess('team-a', 'owner')).role).toBe('owner');
    expect(calls).toContainEqual(['CollaborationTeam', 'eq', 'id', 'team-a']);
  });
  it('binds membership to both the team and requesting user', async () => {
    expect((await teamAccess('team-a', 'person')).role).toBe('member');
    expect(calls).toContainEqual(['CollaborationTeamMember', 'eq', 'teamId', 'team-a']);
    expect(calls).toContainEqual(['CollaborationTeamMember', 'eq', 'userId', 'person']);
  });
  it('revokes access when membership disappears or its query fails', async () => {
    state.CollaborationTeamMember = null;
    await expect(teamAccess('team-a', 'person')).rejects.toThrow();
    state.CollaborationTeamMember = { role: 'admin' };
    state.CollaborationTeamMemberError = { message: 'outage' };
    await expect(teamAccess('team-a', 'person')).rejects.toThrow();
  });
  it('prevents members from generating invitations or escalating authority', async () => {
    await expect(inviteTeam('team-a', 'person')).rejects.toThrow();
    await expect(changeTeamMember('team-a', 'person', 'person', 'admin')).rejects.toThrow();
    expect(calls.some(call => call[1] === 'update')).toBe(false);
  });
  it('allows only the owner to change membership and protects the owner', async () => {
    state.CollaborationTeamMember = { role: 'admin' };
    await expect(changeTeamMember('team-a', 'person', 'other', 'remove')).rejects.toThrow();
    await expect(changeTeamMember('team-a', 'owner', 'owner', 'remove')).rejects.toThrow();
    await changeTeamMember('team-a', 'owner', 'other', 'remove');
    expect(calls).toContainEqual(['CollaborationTeamMember', 'eq', 'teamId', 'team-a']);
    expect(calls).toContainEqual(['CollaborationTeamMember', 'eq', 'userId', 'other']);
  });
  it('stores only a digest of the expiring invitation', async () => {
    const invite = await inviteTeam('team-a', 'owner');
    expect(invite.code).toHaveLength(32);
    const mutation = calls.find(call => call[1] === 'update')![2] as { inviteHash: string; inviteExpiresAt: string };
    expect(mutation.inviteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(mutation)).not.toContain(invite.code);
    expect(Date.parse(mutation.inviteExpiresAt)).toBeGreaterThan(Date.now());
  });
  it('checks invitation expiry and preserves an existing member role on rejoin', async () => {
    await joinTeam('x'.repeat(32), 'person');
    expect(calls.some(call => call[1] === 'gt' && call[2] === 'inviteExpiresAt')).toBe(true);
    expect(calls).toContainEqual(['CollaborationTeamMember', 'upsert', { teamId: 'team-a', userId: 'person', role: 'member' }, { onConflict: 'teamId,userId', ignoreDuplicates: true }]);
    state.CollaborationTeam = null;
    await expect(joinTeam('x'.repeat(32), 'person')).rejects.toThrow();
  });
  it('rejects inactive or banned users before team operations', async () => {
    for (const record of [{ status: 'offboarded' }, { platformRole: 'banned' }, null]) {
      state.User = record;
      await expect(teamUser('clerk-person')).rejects.toThrow();
    }
  });
});

it('keeps revoked members out even when they still know an invitation code', async () => {
  state.CollaborationTeamMember = { role: 'member', revokedAt: new Date().toISOString() };
  await expect(teamAccess('team-a', 'person')).rejects.toThrow();
  await expect(joinTeam('x'.repeat(32), 'person')).rejects.toThrow();
});
