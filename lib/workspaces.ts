/**
 * Multi-business workspaces: one person can own several Spaces (Apple and
 * Pixar), switch between them, and invite teammates. Creating extra
 * businesses and inviting people is paid-only — Free stays one book, just you.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { unscoped } from '@/lib/supabase-guard';
import { hasCurrentSubscription } from '@/lib/api-auth';
import { isAccountComped } from '@/lib/billing/comp';
import { normalizeSlug, isValidSlug } from '@/lib/intake';
import { ensureDefaultPipelines } from '@/lib/pipelines';
import { isUserPlatformAdmin } from '@/lib/permissions';

export const MAX_OWNED_SPACES = 10;
export const MAX_PENDING_INVITES = 50;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export type WorkspaceListItem = {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
};

export function slugFromBusinessName(name: string): string {
  const trimmed = name.trim();
  const base = normalizeSlug(trimmed);
  if (isValidSlug(base)) return base;
  const padded = `${base}biz`.replace(/[^a-z0-9-]/g, '');
  if (isValidSlug(padded)) return padded;
  return `biz-${Date.now().toString(36)}`.slice(0, 40);
}

export function uniqueSlugCandidate(base: string, attempt: number): string {
  if (attempt <= 0) return base.slice(0, 40);
  const suffix = `-${attempt + 1}`;
  return `${base.slice(0, Math.max(3, 40 - suffix.length))}${suffix}`;
}

export function isPaidEntitlement(args: {
  status: string | null | undefined;
  periodEnd: string | Date | null | undefined;
  comped?: boolean;
}): boolean {
  if (args.comped) return true;
  return hasCurrentSubscription(args.status, args.periodEnd);
}

export async function ownerHasPaidWorkspace(
  ownerUserId: string,
  clerkUserId?: string,
): Promise<boolean> {
  if (clerkUserId && (await isUserPlatformAdmin(clerkUserId))) return true;

  const { data: spaces, error } = await supabase
    .from('Space')
    .select('id, stripeSubscriptionStatus, stripePeriodEnd')
    .eq('ownerId', ownerUserId);
  if (error) throw error;

  for (const space of spaces ?? []) {
    if (
      isPaidEntitlement({
        status: space.stripeSubscriptionStatus,
        periodEnd: space.stripePeriodEnd,
      })
    ) {
      return true;
    }
    if (await isAccountComped('Space', space.id)) return true;
  }
  return false;
}

export async function listWorkspacesForUser(userId: string): Promise<WorkspaceListItem[]> {
  const { data: owned, error: ownedErr } = await supabase
    .from('Space')
    .select('id, slug, name, createdAt')
    .eq('ownerId', userId)
    .order('createdAt', { ascending: true });
  if (ownedErr) throw ownedErr;

  const { data: memberships, error: memErr } = await unscoped(
    supabase.from('SpaceMembership'),
    'list workspace memberships for the authenticated user',
  )
    .select('spaceId, role')
    .eq('userId', userId);
  if (memErr) throw memErr;

  const memberIds = (memberships ?? [])
    .map((m) => m.spaceId as string)
    .filter((id) => !(owned ?? []).some((s) => s.id === id));

  let memberSpaces: { id: string; slug: string; name: string }[] = [];
  if (memberIds.length > 0) {
    const { data, error } = await supabase
      .from('Space')
      .select('id, slug, name')
      .in('id', memberIds);
    if (error) throw error;
    memberSpaces = (data ?? []) as typeof memberSpaces;
  }

  const roleBySpace = new Map<string, WorkspaceRole>();
  for (const m of memberships ?? []) {
    roleBySpace.set(m.spaceId, m.role === 'admin' ? 'admin' : 'member');
  }

  const items: WorkspaceListItem[] = [];
  for (const space of owned ?? []) {
    items.push({ id: space.id, slug: space.slug, name: space.name, role: 'owner' });
  }
  for (const space of memberSpaces) {
    items.push({
      id: space.id,
      slug: space.slug,
      name: space.name,
      role: roleBySpace.get(space.id) ?? 'member',
    });
  }
  return items;
}

export async function userCanAccessSpace(userId: string, spaceId: string): Promise<boolean> {
  const { data: owned } = await supabase
    .from('Space')
    .select('id')
    .eq('id', spaceId)
    .eq('ownerId', userId)
    .maybeSingle();
  if (owned) return true;

  const { data: member } = await tenantTable(supabase, 'SpaceMembership', { spaceId })
    .select('id')
    .eq('userId', userId)
    .maybeSingle();
  return !!member;
}

export async function userCanManageSpace(userId: string, spaceId: string): Promise<boolean> {
  const { data: owned } = await supabase
    .from('Space')
    .select('id')
    .eq('id', spaceId)
    .eq('ownerId', userId)
    .maybeSingle();
  if (owned) return true;

  const { data: member } = await tenantTable(supabase, 'SpaceMembership', { spaceId })
    .select('id')
    .eq('userId', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!member;
}

export async function createAdditionalWorkspace(args: {
  ownerUserId: string;
  clerkUserId: string;
  name: string;
}): Promise<{ ok: true; slug: string; id: string } | { ok: false; status: number; error: string }> {
  const name = args.name.trim();
  if (name.length < 2 || name.length > 80) {
    return { ok: false, status: 400, error: 'Business name must be 2–80 characters.' };
  }

  const paid = await ownerHasPaidWorkspace(args.ownerUserId, args.clerkUserId);
  if (!paid) {
    return {
      ok: false,
      status: 402,
      error: 'Adding another business is available on a paid plan.',
    };
  }

  const { count, error: countErr } = await supabase
    .from('Space')
    .select('id', { count: 'exact', head: true })
    .eq('ownerId', args.ownerUserId);
  if (countErr) throw countErr;
  if ((count ?? 0) >= MAX_OWNED_SPACES) {
    return { ok: false, status: 429, error: `You can own up to ${MAX_OWNED_SPACES} businesses.` };
  }

  const base = slugFromBusinessName(name);
  let slug = base;
  for (let attempt = 0; attempt < 8; attempt++) {
    slug = uniqueSlugCandidate(base, attempt);
    if (!isValidSlug(slug)) continue;
    const { data: taken } = await supabase.from('Space').select('id').eq('slug', slug).maybeSingle();
    if (!taken) break;
    if (attempt === 7) {
      return { ok: false, status: 409, error: 'That workspace address is taken. Try a different name.' };
    }
  }

  const spaceId = crypto.randomUUID();
  const { error: insertErr } = await supabase.from('Space').insert({
    id: spaceId,
    slug,
    name,
    emoji: '🏢',
    ownerId: args.ownerUserId,
  });
  if (insertErr) {
    if (insertErr.code === '23505') {
      return { ok: false, status: 409, error: 'That workspace address is taken. Try a different name.' };
    }
    throw insertErr;
  }

  const { error: settingsErr } = await tenantTable(supabase, 'SpaceSetting', { spaceId }).insert({
    id: crypto.randomUUID(),
    spaceId,
    businessName: name,
  });
  if (settingsErr) {
    console.error('[workspaces] SpaceSetting insert failed', settingsErr);
  }

  try {
    await ensureDefaultPipelines(spaceId);
  } catch (err) {
    console.error('[workspaces] pipeline bootstrap failed', err);
  }

  return { ok: true, slug, id: spaceId };
}

export function isValidInviteEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 3 && trimmed.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export async function inviteToWorkspace(args: {
  spaceId: string;
  actorUserId: string;
  clerkUserId: string;
  email: string;
  role?: 'admin' | 'member';
}): Promise<
  | { ok: true; token: string; inviteUrl: string; email: string }
  | { ok: false; status: number; error: string }
> {
  const email = args.email.trim().toLowerCase();
  if (!isValidInviteEmail(email)) {
    return { ok: false, status: 400, error: 'Enter a valid email.' };
  }
  const role = args.role === 'admin' ? 'admin' : 'member';

  const canManage = await userCanManageSpace(args.actorUserId, args.spaceId);
  if (!canManage) {
    return { ok: false, status: 403, error: 'Only the owner or an admin can invite people.' };
  }

  const { data: space } = await supabase
    .from('Space')
    .select('id, ownerId, name, slug')
    .eq('id', args.spaceId)
    .maybeSingle();
  if (!space) return { ok: false, status: 404, error: 'Workspace not found.' };

  const paid = await ownerHasPaidWorkspace(space.ownerId, args.clerkUserId);
  if (!paid) {
    return {
      ok: false,
      status: 402,
      error: 'Adding people to a workspace is available on a paid plan.',
    };
  }

  const { data: existingUser } = await supabase
    .from('User')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingUser) {
    if (existingUser.id === space.ownerId) {
      return { ok: false, status: 409, error: 'That person already owns this workspace.' };
    }
    const { data: existingMember } = await tenantTable(supabase, 'SpaceMembership', {
      spaceId: args.spaceId,
    })
      .select('id')
      .eq('userId', existingUser.id)
      .maybeSingle();
    if (existingMember) {
      return { ok: false, status: 409, error: 'That person is already on this workspace.' };
    }
  }

  const { data: existingInvite } = await tenantTable(supabase, 'SpaceInvitation', {
    spaceId: args.spaceId,
  })
    .select('id, token')
    .eq('email', email)
    .eq('status', 'pending')
    .gt('expiresAt', new Date().toISOString())
    .maybeSingle();
  if (existingInvite) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.usechippi.com';
    return {
      ok: true,
      token: existingInvite.token,
      inviteUrl: `${appUrl}/invite/space/${existingInvite.token}`,
      email,
    };
  }

  const { count } = await tenantTable(supabase, 'SpaceInvitation', { spaceId: args.spaceId })
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .gt('expiresAt', new Date().toISOString());
  if ((count ?? 0) >= MAX_PENDING_INVITES) {
    return { ok: false, status: 429, error: 'Too many pending invitations. Revoke some first.' };
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const { error: insertErr } = await tenantTable(supabase, 'SpaceInvitation', {
    spaceId: args.spaceId,
  }).insert({
    id: crypto.randomUUID(),
    spaceId: args.spaceId,
    email,
    role,
    token,
    status: 'pending',
    invitedByUserId: args.actorUserId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  });
  if (insertErr) throw insertErr;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.usechippi.com';
  return {
    ok: true,
    token,
    inviteUrl: `${appUrl}/invite/space/${token}`,
    email,
  };
}

export async function acceptSpaceInvitation(args: {
  token: string;
  userId: string;
  email: string;
}): Promise<{ ok: true; slug: string } | { ok: false; status: number; error: string }> {
  const token = args.token.trim();
  if (!token) return { ok: false, status: 400, error: 'Missing invitation.' };

  const { data: invite, error } = await unscoped(
    supabase.from('SpaceInvitation'),
    'accept invitation by unguessable token',
  )
    .select('id, spaceId, email, role, status, expiresAt')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!invite) return { ok: false, status: 404, error: 'Invitation not found.' };
  if (invite.status !== 'pending') {
    return { ok: false, status: 409, error: 'This invitation is no longer pending.' };
  }
  if (new Date(invite.expiresAt) < new Date()) {
    return { ok: false, status: 410, error: 'This invitation has expired.' };
  }
  if (invite.email.toLowerCase() !== args.email.trim().toLowerCase()) {
    return { ok: false, status: 403, error: 'Sign in with the invited email to accept.' };
  }

  const { data: space } = await supabase
    .from('Space')
    .select('id, slug, ownerId')
    .eq('id', invite.spaceId)
    .maybeSingle();
  if (!space) return { ok: false, status: 404, error: 'Workspace not found.' };
  if (space.ownerId === args.userId) {
    return { ok: true, slug: space.slug };
  }

  const { error: memErr } = await tenantTable(supabase, 'SpaceMembership', {
    spaceId: invite.spaceId,
  }).upsert(
    {
      id: crypto.randomUUID(),
      spaceId: invite.spaceId,
      userId: args.userId,
      role: invite.role === 'admin' ? 'admin' : 'member',
    },
    { onConflict: 'spaceId,userId' },
  );
  if (memErr) throw memErr;

  await tenantTable(supabase, 'SpaceInvitation', { spaceId: invite.spaceId })
    .update({ status: 'accepted' })
    .eq('id', invite.id);

  return { ok: true, slug: space.slug };
}
