import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';

export type TeamRole = 'owner' | 'admin' | 'member';
export type Team = { id: string; name: string; ownerId: string; parentKind: 'personal' | 'brokerage'; parentRouteId: string };
const columns = 'id, name, ownerId, parentKind, parentRouteId';
const teams = () => unscoped(supabase.from('CollaborationTeam'), 'team account authority resolved by owner or explicit membership before access');
const members = () => unscoped(supabase.from('CollaborationTeamMember'), 'team membership queries bind authenticated user or authorized team');
export async function teamUser(clerkId: string) {
  const { data, error } = await supabase.from('User').select('id, clerkId, status, platformRole').eq('clerkId', clerkId).maybeSingle();
  if (error || !data || data.status === 'offboarded' || data.platformRole === 'banned') throw new Error('Account unavailable');
  return data;
}
export async function teamAccess(teamId: string, userId: string) {
  const { data, error } = await teams().select(columns).eq('id', teamId).maybeSingle();
  if (error || !data) throw new Error('Team unavailable');
  const team = data as Team;
  if (team.ownerId === userId) return { team, role: 'owner' as TeamRole };
  const membership = await members().select('role, revokedAt').eq('teamId', teamId).eq('userId', userId).maybeSingle();
  if (membership.error || membership.data?.revokedAt || !['admin', 'member'].includes(membership.data?.role)) throw new Error('Team unavailable');
  return { team, role: membership.data!.role as TeamRole };
}
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 100) {
    const result = await page(from, from + 99);
    if (result.error) throw new Error('Teams unavailable');
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 100) return rows;
  }
}
export async function listTeams(userId: string) {
  const [owned, joined] = await Promise.all([
    allRows((from, to) => teams().select(columns).eq('ownerId', userId).order('id').range(from, to)),
    allRows((from, to) => members().select('teamId, role, CollaborationTeam(id, name, ownerId, parentKind, parentRouteId)').eq('userId', userId).is('revokedAt', null).order('teamId').range(from, to)),
  ]);
  const result = new Map<string, Team & { role: TeamRole }>();
  for (const row of joined) {
    const team = (Array.isArray(row.CollaborationTeam) ? row.CollaborationTeam[0] : row.CollaborationTeam) as Team | null;
    if (team) result.set(team.id, { ...team, role: row.role as TeamRole });
  }
  for (const team of owned) result.set(team.id, { ...team, role: 'owner' });
  return [...result.values()];
}
export async function createTeam(ownerId: string, name: string, parentKind: 'personal' | 'brokerage', parentRouteId: string) {
  const { data, error } = await teams().insert({ id: randomUUID(), ownerId, name, parentKind, parentRouteId }).select(columns).single();
  if (error) throw new Error('Could not create team');
  return data as Team;
}
export async function inviteTeam(teamId: string, userId: string) {
  const { role } = await teamAccess(teamId, userId);
  if (role === 'member') throw new Error('Only team administrators can invite members');
  const code = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const { error } = await teams().update({ inviteHash: createHash('sha256').update(code).digest('hex'), inviteExpiresAt: expiresAt }).eq('id', teamId);
  if (error) throw new Error('Could not create invitation');
  return { code, expiresAt };
}
export async function joinTeam(code: string, userId: string) {
  const { data, error } = await teams().select(columns).eq('inviteHash', createHash('sha256').update(code).digest('hex')).gt('inviteExpiresAt', new Date().toISOString()).maybeSingle();
  if (error || !data) throw new Error('Invitation expired or unavailable');
  if (data.ownerId !== userId) {
    const result = await members().upsert({ teamId: data.id, userId, role: 'member' }, { onConflict: 'teamId,userId', ignoreDuplicates: true });
    if (result.error) throw new Error('Could not join team');
    await teamAccess(data.id, userId); // A revoked member cannot reuse an old invitation.
  }
  return data as Team;
}
export async function teamMembers(teamId: string, userId: string) {
  const { team, role } = await teamAccess(teamId, userId);
  if (role === 'member') throw new Error('Only team administrators can manage membership');
  const data = await allRows((from, to) => members().select('userId, role, User(name)').eq('teamId', teamId).is('revokedAt', null).order('userId').range(from, to));
  return { ownerId: team.ownerId, members: data };
}
export async function changeTeamMember(teamId: string, actorId: string, userId: string, role: 'admin' | 'member' | 'remove') {
  const access = await teamAccess(teamId, actorId);
  // Only the owner assigns authority or removes members. The owner cannot be removed.
  if (access.role !== 'owner' || userId === access.team.ownerId) throw new Error('Only the team owner can change membership');
  const query = members();
  const result = await query.update(role === 'remove' ? { revokedAt: new Date().toISOString() } : { role }).eq('teamId', teamId).eq('userId', userId);
  if (result.error) throw new Error('Could not change membership');
}
