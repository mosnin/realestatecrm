/**
 * Auto-assignment logic for brokerage leads.
 *
 * Distributes newly-created brokerage leads to realtor_members using one of
 * three strategies: round-robin (default), score-based, or workload-balanced.
 *
 * Settings are stored in Redis under `brokerage:auto-assign:<id>` to avoid
 * schema changes. The settings API (/api/broker/settings) reads/writes them.
 */

import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceByOwnerId } from '@/lib/space';
import { notifyNewLead } from '@/lib/notify';
import type { Contact } from '@/lib/types';

export type DistributionMethod = 'round-robin' | 'score-based' | 'workload-balanced';

export interface AutoAssignSettings {
  enabled: boolean;
  method: DistributionMethod;
}

const SETTINGS_PREFIX = 'brokerage:auto-assign:';
const COUNTER_PREFIX = 'brokerage:rr-counter:';

// ── Settings helpers ─────────────────────────────────────────────────────────

export async function getAutoAssignSettings(brokerageId: string): Promise<AutoAssignSettings> {
  try {
    const raw = await redis.get(`${SETTINGS_PREFIX}${brokerageId}`);
    if (raw && typeof raw === 'object') return raw as AutoAssignSettings;
    if (typeof raw === 'string') return JSON.parse(raw) as AutoAssignSettings;
  } catch {
    // Ignore redis errors — fall back to disabled
  }
  return { enabled: false, method: 'round-robin' };
}

export async function setAutoAssignSettings(
  brokerageId: string,
  settings: AutoAssignSettings,
): Promise<void> {
  await redis.set(`${SETTINGS_PREFIX}${brokerageId}`, JSON.stringify(settings));
}

// ── Member helpers ───────────────────────────────────────────────────────────

async function getRealtorMembers(brokerageId: string) {
  const { data: members } = await supabase
    .from('BrokerageMembership')
    .select('userId')
    .eq('brokerageId', brokerageId)
    .eq('role', 'realtor_member')
    .order('createdAt');

  return members ?? [];
}

// ── Distribution strategies ──────────────────────────────────────────────────

async function pickRoundRobin(brokerageId: string, memberCount: number): Promise<number> {
  try {
    const counter = await redis.incr(`${COUNTER_PREFIX}${brokerageId}`);
    // counter starts at 1 after first incr, so subtract 1 for 0-based index
    return (counter - 1) % memberCount;
  } catch {
    // Fallback: just use index 0
    return 0;
  }
}

async function pickScoreBased(
  contact: Contact,
  brokerageId: string,
  members: { userId: string }[],
): Promise<number> {
  // Hot leads (score >= 70) go to the realtor with the most 'won' deals (top performer).
  // Other leads use round-robin.
  const score = contact.leadScore ?? 0;
  if (score < 70) {
    return pickRoundRobin(brokerageId, members.length);
  }

  // Find the realtor with the most won deals
  let bestIdx = 0;
  let bestCount = -1;

  for (let i = 0; i < members.length; i++) {
    const space = await getSpaceByOwnerId(members[i].userId);
    if (!space) continue;

    const { count } = await supabase
      .from('Deal')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .eq('status', 'won');

    if ((count ?? 0) > bestCount) {
      bestCount = count ?? 0;
      bestIdx = i;
    }
  }

  return bestIdx;
}

async function pickWorkloadBalanced(members: { userId: string }[]): Promise<number> {
  let bestIdx = 0;
  let fewest = Infinity;

  for (let i = 0; i < members.length; i++) {
    const space = await getSpaceByOwnerId(members[i].userId);
    if (!space) continue;

    const { count } = await supabase
      .from('Contact')
      .select('*', { count: 'exact', head: true })
      .eq('spaceId', space.id)
      .not('tags', 'cs', '{"archived"}');

    const active = count ?? 0;
    if (active < fewest) {
      fewest = active;
      bestIdx = i;
    }
  }

  return bestIdx;
}

// ── Main auto-assign function ────────────────────────────────────────────────

export async function autoAssignLead(
  brokerageId: string,
  contactId: string,
  spaceId: string,
): Promise<string | null> {
  const settings = await getAutoAssignSettings(brokerageId);
  if (!settings.enabled) return null;

  const members = await getRealtorMembers(brokerageId);
  if (!members.length) return null;

  // Fetch the contact
  const { data: contact } = await supabase
    .from('Contact')
    .select('*')
    .eq('id', contactId)
    .eq('spaceId', spaceId)
    .maybeSingle();

  if (!contact) return null;

  // Already assigned?
  const existingTags: string[] = contact.tags ?? [];
  if (existingTags.includes('assigned')) return null;

  // Pick the target realtor
  let index: number;
  switch (settings.method) {
    case 'score-based':
      index = await pickScoreBased(contact as Contact, brokerageId, members);
      break;
    case 'workload-balanced':
      index = await pickWorkloadBalanced(members);
      break;
    case 'round-robin':
    default:
      index = await pickRoundRobin(brokerageId, members.length);
      break;
  }

  const targetUserId = members[index].userId;

  // Get target realtor's space
  const targetSpace = await getSpaceByOwnerId(targetUserId);
  if (!targetSpace) return null;

  // Fetch the realtor's name
  const { data: realtorUser } = await supabase
    .from('User')
    .select('name, email')
    .eq('id', targetUserId)
    .maybeSingle();
  const realtorName = realtorUser?.name ?? realtorUser?.email ?? targetUserId;

  // Clone contact to realtor's space (same logic as assign-lead API)
  const newContactId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: cloneError } = await supabase.from('Contact').insert({
    id: newContactId,
    spaceId: targetSpace.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    budget: contact.budget,
    preferences: contact.preferences,
    address: contact.address,
    notes: contact.notes,
    type: contact.type,
    properties: contact.properties ?? [],
    tags: ['assigned-by-broker', 'new-lead'],
    scoringStatus: contact.scoringStatus,
    leadScore: contact.leadScore,
    scoreLabel: contact.scoreLabel,
    scoreSummary: contact.scoreSummary,
    scoreDetails: contact.scoreDetails,
    sourceLabel: 'brokerage: auto-assigned',
    applicationData: contact.applicationData,
    applicationRef: contact.applicationRef,
    applicationStatus: contact.applicationStatus,
  });
  if (cloneError) {
    console.error('[auto-assign] clone failed', { contactId, targetUserId, cloneError });
    return null;
  }

  // Mark original as assigned
  const assignmentNote = [
    contact.notes,
    `\nAuto-assigned to: ${realtorName}`,
    `--- Auto-assigned to realtor (${targetUserId}) on ${now} ---`,
  ]
    .filter(Boolean)
    .join('\n');

  const assignmentMeta = JSON.stringify({
    assignedTo: targetUserId,
    assignedToName: realtorName,
    assignedContactId: newContactId,
    assignedSpaceId: targetSpace.id,
    assignedAt: now,
    autoAssigned: true,
    method: settings.method,
  });

  await supabase
    .from('Contact')
    .update({
      tags: [...existingTags.filter((t: string) => t !== 'new-lead'), 'assigned'],
      notes: assignmentNote,
      applicationStatus: 'assigned',
      applicationStatusNote: assignmentMeta,
      updatedAt: now,
    })
    .eq('id', contactId);

  console.info('[auto-assign] lead assigned', {
    contactId,
    newContactId,
    brokerageId,
    targetUserId,
    method: settings.method,
  });

  // Notify the realtor (non-blocking)
  void (async () => {
    try {
      await notifyNewLead({
        spaceId: targetSpace.id,
        contactId: newContactId,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        leadScore: contact.leadScore,
        scoreLabel: contact.scoreLabel,
        scoreSummary: contact.scoreSummary,
        applicationData: contact.applicationData,
      });
    } catch (err) {
      console.error('[auto-assign] notification failed', { newContactId, err });
    }
  })();

  return targetUserId;
}
