import 'server-only';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { unscoped } from '@/lib/supabase-guard';
import { teamAccess } from './server';
import {listBrokerageRecords,brokerageSharingAvailable} from './brokerage-records';

import { RECORD_KINDS, SHARED_RECORD_FIELDS, type RecordKind } from './record-fields';
export { RECORD_KINDS, SHARED_RECORD_FIELDS, type RecordKind } from './record-fields';
const grants = () => unscoped(supabase.from('TeamRecordGrant'), 'team membership validated before reading explicit record grants across spaces');
const PAGE_SIZE = 25;
type Grant = { id: string; teamId: string; spaceId: string; recordKind: RecordKind; recordId: string; grantedBy: string };
export type SharedRecord = { grantId: string; kind: RecordKind; title: string; fields: Record<string, unknown>; canRevoke: boolean; source?: 'brokerage' };

async function ownedSpace(spaceId: string, actorId: string) {
  const result = await supabase.from('Space').select('id, name').eq('id', spaceId).eq('ownerId', actorId).maybeSingle();
  if (result.error || !result.data) throw new Error('Workspace unavailable');
  return result.data;
}
async function readRecord(spaceId: string, kind: RecordKind, recordId: string) {
  const policy = SHARED_RECORD_FIELDS[kind];
  if (!policy) throw new Error('Unsupported record type');
  let query = tenantTable(supabase, policy.table, { spaceId }).select(policy.columns).eq('id', recordId);
  if (kind !== 'deal') query = query.is('brokerageId', null); // Assignment is not ownership of brokerage-pool records.
  const result = await query.maybeSingle();
  if (result.error) throw new Error('Record unavailable');
  return result.data as Record<string, unknown> | null;
}
export async function shareRecord(teamId: string, actorId: string, input: { spaceId: string; kind: RecordKind; recordId: string }) {
  await teamAccess(teamId, actorId);
  await ownedSpace(input.spaceId, actorId);
  if (!(await readRecord(input.spaceId, input.kind, input.recordId))) throw new Error('Record unavailable');
  const result = await tenantTable(supabase, 'TeamRecordGrant', { spaceId: input.spaceId }).upsert({
    teamId, spaceId: input.spaceId, recordKind: input.kind, recordId: input.recordId,
    grantedBy: actorId, revokedAt: null, createdAt: new Date().toISOString(),
  }, { onConflict: 'teamId,spaceId,recordKind,recordId' }).select('id').single();
  if (result.error) throw new Error('Record could not be shared');
  return result.data;
}
export async function revokeRecord(teamId: string, actorId: string, grantId: string) {
  const access = await teamAccess(teamId, actorId);
  const result = await grants().select('id, spaceId, grantedBy').eq('teamId', teamId).eq('id', grantId).maybeSingle();
  if (result.error || !result.data) throw new Error('Share unavailable');
  if (result.data.grantedBy !== actorId && access.role !== 'owner') throw new Error('Only the person who shared this record or the team owner can stop sharing');
  const updated = await tenantTable(supabase, 'TeamRecordGrant', { spaceId: result.data.spaceId }).update({ revokedAt: new Date().toISOString() }).eq('teamId', teamId).eq('id', grantId);
  if (updated.error) throw new Error('Sharing could not be stopped');
  return { spaceId: result.data.spaceId as string };
}

export async function listSharedRecords(teamId: string, actorId: string, input: { offset?: number; kind?: RecordKind } = {}) {
  const access = await teamAccess(teamId, actorId);
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('Invalid page');
  let query = grants().select('id, teamId, spaceId, recordKind, recordId, grantedBy').eq('teamId', teamId).is('revokedAt', null);
  if (input.kind) query = query.eq('recordKind', input.kind);
  const result = await query.order('createdAt', { ascending: false }).order('id').range(offset, offset + PAGE_SIZE - 1);
  if (result.error) throw new Error('Shared records unavailable');
  const liveOwners = new Map<string, Promise<boolean>>();
  const records: SharedRecord[] = [];
  for (const grant of (result.data ?? []) as Grant[]) {
    const key = `${grant.grantedBy}:${grant.spaceId}`;
    if (!liveOwners.has(key)) liveOwners.set(key, (async () => {
      // Removal, offboarding, or transfer of the source workspace ends the grant.
      const user = await supabase.from('User').select('id, status, platformRole').eq('id', grant.grantedBy).maybeSingle();
      if (user.error) throw new Error('Shared records unavailable');
      if (!user.data || user.data.status === 'offboarded' || user.data.platformRole === 'banned') return false;
      if (access.team.ownerId !== grant.grantedBy) {
        const member = await unscoped(supabase.from('CollaborationTeamMember'), 'verify grantor is still a member of the authorized team').select('role, revokedAt').eq('teamId', teamId).eq('userId', grant.grantedBy).maybeSingle();
        if (member.error) throw new Error('Shared records unavailable');
        if (!member.data || member.data.revokedAt || !['admin', 'member'].includes(member.data.role)) return false;
      }
      const space = await supabase.from('Space').select('id').eq('id', grant.spaceId).eq('ownerId', grant.grantedBy).maybeSingle();
      if (space.error) throw new Error('Shared records unavailable');
      return Boolean(space.data);
    })());
    if (!(await liveOwners.get(key))) continue;
    const record = await readRecord(grant.spaceId, grant.recordKind, grant.recordId);
    if (!record) continue;
    const fields = Object.fromEntries(SHARED_RECORD_FIELDS[grant.recordKind].columns.split(', ').filter(key => key !== 'id').map(key => [key, record[key] ?? null]));
    records.push({ grantId: grant.id, kind: grant.recordKind, title: String(record[SHARED_RECORD_FIELDS[grant.recordKind].title] ?? 'Untitled'), fields,
      canRevoke: grant.grantedBy === actorId || access.role === 'owner' });
  }
  const brokerage=await listBrokerageRecords(teamId,actorId,input);
  return { records:[...records,...brokerage.records], brokerageSharingAvailable:await brokerageSharingAvailable(teamId,actorId), nextOffset: (result.data?.length ?? 0) === PAGE_SIZE || brokerage.nextOffset!==null ? offset + PAGE_SIZE : null };
}

export async function sharingCandidates(teamId: string, actorId: string, input: { spaceId?: string; kind: RecordKind; search?: string; offset?: number }) {
  await teamAccess(teamId, actorId);
  const spaces = await supabase.from('Space').select('id, name').eq('ownerId', actorId).order('id');
  if (spaces.error) throw new Error('Workspaces unavailable');
  const spaceId = input.spaceId ?? spaces.data?.[0]?.id;
  if (!spaceId) return { spaces: [], records: [], spaceId: null, nextOffset: null };
  if (!spaces.data?.some(space => space.id === spaceId)) throw new Error('Workspace unavailable');
  const policy = SHARED_RECORD_FIELDS[input.kind];
  if (!policy) throw new Error('Unsupported record type');
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('Invalid page');
  let query = tenantTable(supabase, policy.table, { spaceId }).select(policy.columns);
  if (input.kind !== 'deal') query = query.is('brokerageId', null);
  if (input.search?.trim()) query = query.ilike(policy.title, `%${input.search.trim().replace(/[\\%_]/g, '\\$&')}%`);
  const result = await query.order(policy.title).order('id').range(offset, offset + PAGE_SIZE - 1);
  if (result.error) throw new Error('Records unavailable');
  return { spaces: spaces.data, spaceId, records: result.data ?? [], nextOffset: result.data?.length === PAGE_SIZE ? offset + PAGE_SIZE : null };
}
