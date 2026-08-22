/**
 * Notification preference resolution.
 *
 * Notification prefs have two layers:
 *
 *   1. SPACE DEFAULT — the existing toggles on SpaceSetting
 *      (notifications, smsNotifications, notifyPush, notifyNewLeads,
 *      notifyTourBookings, notifyNewDeals, notifyFollowUps) plus the new
 *      `digestCadence`. This is what every member of a space inherits.
 *
 *   2. PER-MEMBER OVERRIDE — a NotificationPreference row keyed by
 *      (spaceId, userId). Every column is nullable; a NULL means "inherit the
 *      space default for this knob". A member overrides only what they set.
 *
 * Effective preference = member override ?? space default, resolved per field.
 *
 * This module is the single source of truth for that merge. The per-event
 * dispatcher (lib/notify.ts) and the digest cron (app/api/cron/notification-
 * digest) both resolve through here so the two layers can never drift.
 *
 * EVERYTHING here is additive and default-OFF: with no NotificationPreference
 * row and digestCadence='off' (the column default), resolveEffectivePrefs
 * returns exactly the values the old code read straight off SpaceSetting.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';

export type DigestCadence = 'off' | 'daily' | 'weekly';

/** The four notifiable event types, in dispatch terms. */
export type NotifiableEventType = 'newLeads' | 'tourBookings' | 'newDeals' | 'followUps';

export interface EffectiveChannels {
  email: boolean;
  sms: boolean;
  push: boolean;
}

export interface EffectiveEventTypes {
  newLeads: boolean;
  tourBookings: boolean;
  newDeals: boolean;
  followUps: boolean;
}

export interface EffectivePrefs {
  channels: EffectiveChannels;
  eventTypes: EffectiveEventTypes;
  digestCadence: DigestCadence;
}

/** Shape of the SpaceSetting columns this resolver reads. */
interface SpaceSettingPrefsRow {
  notifications: boolean | null;
  smsNotifications: boolean | null;
  notifyPush: boolean | null;
  notifyNewLeads: boolean | null;
  notifyTourBookings: boolean | null;
  notifyNewDeals: boolean | null;
  notifyFollowUps: boolean | null;
  digestCadence: string | null;
}

/** Shape of the NotificationPreference override row (all nullable). */
interface PreferenceOverrideRow {
  channels: Partial<EffectiveChannels> | null;
  eventTypes: Partial<EffectiveEventTypes> | null;
  digestCadence: string | null;
}

const SPACE_SETTING_PREFS_COLUMNS =
  'notifications, smsNotifications, notifyPush, notifyNewLeads, notifyTourBookings, notifyNewDeals, notifyFollowUps, digestCadence';

/** Coerce an arbitrary string into a valid cadence, defaulting to 'off'. */
export function normalizeCadence(value: unknown): DigestCadence {
  return value === 'daily' || value === 'weekly' ? value : 'off';
}

/**
 * The space-level default prefs, with the same fallbacks the old code applied
 * inline (email on, sms off, push on, every event type on). A space with no
 * SpaceSetting row gets these defaults verbatim.
 */
function spaceDefaults(row: SpaceSettingPrefsRow | null): EffectivePrefs {
  return {
    channels: {
      email: row?.notifications ?? true,
      sms: row?.smsNotifications ?? false,
      push: row?.notifyPush ?? true,
    },
    eventTypes: {
      newLeads: row?.notifyNewLeads ?? true,
      tourBookings: row?.notifyTourBookings ?? true,
      newDeals: row?.notifyNewDeals ?? true,
      followUps: row?.notifyFollowUps ?? true,
    },
    digestCadence: normalizeCadence(row?.digestCadence),
  };
}

/**
 * Merge a per-member override over a resolved space default. Each field of the
 * override coalesces independently: a present boolean wins, a missing/NULL one
 * inherits. The override's digestCadence inherits when NULL.
 *
 * Exported so the resolution rule is unit-testable without a DB.
 */
export function mergePrefs(
  base: EffectivePrefs,
  override: PreferenceOverrideRow | null,
): EffectivePrefs {
  if (!override) return base;

  const ch = override.channels ?? null;
  const ev = override.eventTypes ?? null;

  return {
    channels: {
      email: typeof ch?.email === 'boolean' ? ch.email : base.channels.email,
      sms: typeof ch?.sms === 'boolean' ? ch.sms : base.channels.sms,
      push: typeof ch?.push === 'boolean' ? ch.push : base.channels.push,
    },
    eventTypes: {
      newLeads: typeof ev?.newLeads === 'boolean' ? ev.newLeads : base.eventTypes.newLeads,
      tourBookings:
        typeof ev?.tourBookings === 'boolean' ? ev.tourBookings : base.eventTypes.tourBookings,
      newDeals: typeof ev?.newDeals === 'boolean' ? ev.newDeals : base.eventTypes.newDeals,
      followUps: typeof ev?.followUps === 'boolean' ? ev.followUps : base.eventTypes.followUps,
    },
    // NULL cadence on the override means inherit; otherwise the member's choice
    // (normalized) wins, including an explicit 'off' that mutes their digest.
    digestCadence:
      override.digestCadence == null
        ? base.digestCadence
        : normalizeCadence(override.digestCadence),
  };
}

/**
 * Resolve the EFFECTIVE notification prefs for a member of a space.
 *
 * @param spaceId  The space whose defaults apply.
 * @param userId   The Clerk user id of the member. When omitted (the common
 *                 single-owner path), no override is loaded and the space
 *                 defaults are returned — identical to the legacy behavior.
 *
 * Never throws: on any DB error it logs and returns the space defaults (or the
 * hardcoded fallbacks if even the SpaceSetting read failed), so a prefs lookup
 * can never break a notification send.
 */
export async function resolveEffectivePrefs(
  spaceId: string,
  userId?: string | null,
): Promise<EffectivePrefs> {
  let settingRow: SpaceSettingPrefsRow | null = null;
  let overrideRow: PreferenceOverrideRow | null = null;

  try {
    const [{ data: setting }, overrideRes] = await Promise.all([
      tenantTable(supabase, 'SpaceSetting', { spaceId })
        .select(SPACE_SETTING_PREFS_COLUMNS)
        .maybeSingle(),
      userId
        ? tenantTable(supabase, 'NotificationPreference', { spaceId })
            .select('channels, eventTypes, digestCadence')
            .eq('userId', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    settingRow = (setting as SpaceSettingPrefsRow | null) ?? null;
    overrideRow = (overrideRes?.data as PreferenceOverrideRow | null) ?? null;
  } catch (err) {
    logger.error('[notify-prefs] failed to resolve prefs', { spaceId, userId }, err);
  }

  return mergePrefs(spaceDefaults(settingRow), overrideRow);
}

/**
 * Whether the per-event EMAIL for `eventType` should be SUPPRESSED for this
 * member because a digest will carry it instead.
 *
 * True only when the effective cadence is daily/weekly AND the member still
 * wants that event type (an event type they've turned off is simply not sent
 * at all — there's nothing to roll up). Default cadence 'off' → always false,
 * so the per-event email fires exactly as before.
 *
 * This governs the EMAIL channel only. SMS and push remain immediate by design
 * — a digest is an email roll-up, and texting someone a daily summary is the
 * wrong medium.
 */
export function isEmailDigestSuppressed(
  prefs: EffectivePrefs,
  eventType: NotifiableEventType,
): boolean {
  return prefs.digestCadence !== 'off' && prefs.eventTypes[eventType] === true;
}
