/**
 * Unified notification dispatcher.
 *
 * Sends email (via Resend) and SMS (via Telnyx) notifications to space owners
 * based on their notification preferences in SpaceSetting.
 *
 * Preferences:
 *   - notifications (master email toggle)
 *   - smsNotifications (master SMS toggle)
 *   - notifyNewLeads (per-event: new lead applications)
 *   - notifyTourBookings (per-event: new tour bookings)
 *   - notifyNewDeals (per-event: new deals)
 *   - notifyFollowUps (per-event: follow-up reminders)
 *
 * Preferences resolve through lib/notify-prefs (member override ?? space
 * default). When the owner has opted into a DAILY/WEEKLY digest, the per-event
 * EMAIL for the covered event types is suppressed here — the digest cron
 * (app/api/cron/notification-digest) sends the roll-up instead. SMS and push
 * stay immediate. With the default cadence 'off', nothing is suppressed and
 * this module behaves exactly as before.
 *
 * All functions are non-blocking and never throw.
 */

import { supabase } from '@/lib/supabase';
import { sendNewLeadNotification } from '@/lib/email';
import { sendNewDealNotification } from '@/lib/email';
import { sendAgentNotification, type TourEmailData } from '@/lib/tour-emails';
import { sendSMS, newLeadSMS, newTourSMS, newDealSMS } from '@/lib/sms';
import { sendPushToSpace } from '@/lib/push';
import { createAppNotification } from '@/lib/notifications';
import { formatCompact } from '@/lib/formatting';
import { logger } from '@/lib/logger';
import {
  resolveEffectivePrefs,
  isEmailDigestSuppressed,
  type NotifiableEventType,
} from '@/lib/notify-prefs';

interface SpaceOwnerInfo {
  ownerEmail: string;
  ownerPhone: string | null;
  spaceName: string;
  spaceSlug: string;
  // Channel toggles
  emailEnabled: boolean;
  smsEnabled: boolean;
  // Per-event toggles
  notifyNewLeads: boolean;
  notifyTourBookings: boolean;
  notifyNewDeals: boolean;
  notifyFollowUps: boolean;
  // Web push master toggle
  pushEnabled: boolean;
  /**
   * True when the owner has a daily/weekly digest covering this event type, so
   * the per-event EMAIL must be suppressed (the digest cron sends the roll-up).
   * SMS/push are unaffected. Always false when cadence is 'off'.
   */
  emailDigestSuppressed: (eventType: NotifiableEventType) => boolean;
}

/**
 * Fetch the space owner's contact info and notification preferences.
 * Returns null if space/owner not found.
 *
 * Channel + event-type toggles come from resolveEffectivePrefs, which layers
 * the owner's per-member NotificationPreference override (if any) over the
 * space defaults. The owner's override is keyed by their Clerk user id, so we
 * resolve that from the User row alongside their email.
 */
async function getSpaceOwnerInfo(spaceId: string): Promise<SpaceOwnerInfo | null> {
  try {
    const [{ data: space }, { data: settings }] = await Promise.all([
      supabase.from('Space').select('ownerId, name, slug').eq('id', spaceId).maybeSingle(),
      supabase
        .from('SpaceSetting')
        .select('phoneNumber')
        .eq('spaceId', spaceId)
        .maybeSingle(),
    ]);

    if (!space) return null;

    const { data: owner } = await supabase
      .from('User')
      .select('email, clerkId')
      .eq('id', space.ownerId)
      .maybeSingle();
    if (!owner?.email) return null;

    // Effective prefs = owner override ?? space default (lib/notify-prefs).
    // Passing the owner's clerkId lets a member override for their OWN space
    // apply; with no override row this returns the space defaults verbatim.
    const prefs = await resolveEffectivePrefs(spaceId, owner.clerkId ?? null);

    const smsEnabled = prefs.channels.sms;
    const ownerPhone = settings?.phoneNumber ?? null;

    // Log diagnostic info for SMS delivery issues
    if (!settings) {
      logger.warn('[notify] no SpaceSetting row — SMS disabled by default', { spaceId });
    } else if (smsEnabled && !ownerPhone) {
      logger.warn('[notify] SMS enabled but no phone configured — skipping', { spaceId });
    } else if (!smsEnabled) {
      logger.debug('[notify] SMS disabled for space', { spaceId });
    }

    return {
      ownerEmail: owner.email,
      ownerPhone,
      spaceName: space.name,
      spaceSlug: space.slug,
      emailEnabled: prefs.channels.email,
      smsEnabled,
      notifyNewLeads: prefs.eventTypes.newLeads,
      notifyTourBookings: prefs.eventTypes.tourBookings,
      notifyNewDeals: prefs.eventTypes.newDeals,
      notifyFollowUps: prefs.eventTypes.followUps,
      pushEnabled: prefs.channels.push,
      emailDigestSuppressed: (eventType) => isEmailDigestSuppressed(prefs, eventType),
    };
  } catch (err) {
    logger.error('[notify] failed to fetch space owner info', { spaceId }, err);
    return null;
  }
}

// ── New Lead ─────────────────────────────────────────────────────────────

export interface NotifyNewLeadParams {
  spaceId: string;
  contactId: string;
  name: string;
  phone: string;
  email?: string | null;
  budget?: number | null;
  leadScore?: number | null;
  scoreLabel?: string | null;
  scoreSummary?: string | null;
  applicationData: any;
}

/**
 * Notify space owner about a new lead via email + SMS.
 * Respects both the channel toggles AND the notifyNewLeads event toggle.
 */
export async function notifyNewLead(params: NotifyNewLeadParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info) { logger.warn('[notify] no space owner info', { spaceId: params.spaceId }); return; }
  if (!info.notifyNewLeads) { logger.debug('[notify] notifyNewLeads disabled', { spaceId: params.spaceId }); return; }
  logger.info('[notify] sending lead notification', { spaceId: params.spaceId, emailEnabled: info.emailEnabled, smsEnabled: info.smsEnabled });

  const promises: Promise<unknown>[] = [];

  // Email notification — suppressed when a digest will carry new leads.
  if (info.emailEnabled && !info.emailDigestSuppressed('newLeads')) {
    promises.push(
      sendNewLeadNotification({
        toEmail: info.ownerEmail,
        spaceName: info.spaceName,
        spaceSlug: info.spaceSlug,
        contactId: params.contactId,
        name: params.name,
        phone: params.phone,
        email: params.email,
        budget: params.budget,
        leadScore: params.leadScore,
        scoreLabel: params.scoreLabel,
        scoreSummary: params.scoreSummary,
        applicationData: params.applicationData,
      }).catch((err) => logger.error('[notify] lead email failed', { spaceId: params.spaceId }, err))
    );
  }

  // SMS notification
  if (info.smsEnabled && info.ownerPhone) {
    promises.push(
      sendSMS(
        newLeadSMS({
          spaceName: info.spaceName,
          leadName: params.name,
          leadPhone: params.phone,
          phone: info.ownerPhone,
          scoreLabel: params.scoreLabel,
        })
      ).catch((err) => logger.error('[notify] lead SMS failed', { spaceId: params.spaceId }, err))
    );
  }

  // Push notification
  if (info.pushEnabled) {
    const score = params.scoreLabel ? ` (${params.scoreLabel})` : '';
    promises.push(
      sendPushToSpace(params.spaceId, {
        title: `New lead: ${params.name}${score}`,
        body: `Open ${info.spaceName} to review.`,
        url: `/s/${info.spaceSlug}/contacts/${params.contactId}`,
      }).catch((err) => logger.error('[notify] lead push failed', { spaceId: params.spaceId }, err))
    );
  }

  await Promise.allSettled(promises);
}

// ── New Tour Booked ──────────────────────────────────────────────────────

export interface NotifyNewTourParams {
  spaceId: string;
  tourData: TourEmailData;
}

/**
 * Notify space owner about a new tour booking via email + SMS.
 * Respects both the channel toggles AND the notifyTourBookings event toggle.
 */
export async function notifyNewTour(params: NotifyNewTourParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info || !info.notifyTourBookings) return;

  const promises: Promise<unknown>[] = [];

  // Email notification to agent — suppressed when a digest will carry tours.
  if (info.emailEnabled && !info.emailDigestSuppressed('tourBookings')) {
    promises.push(
      sendAgentNotification(info.ownerEmail, params.tourData)
        .catch((err) => logger.error('[notify] tour email failed', { spaceId: params.spaceId }, err))
    );
  }

  // SMS notification to agent
  if (info.smsEnabled && info.ownerPhone) {
    const d = new Date(params.tourData.startsAt);
    promises.push(
      sendSMS(
        newTourSMS({
          spaceName: info.spaceName,
          guestName: params.tourData.guestName,
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          property: params.tourData.propertyAddress,
          phone: info.ownerPhone,
        })
      ).catch((err) => logger.error('[notify] tour SMS failed', { spaceId: params.spaceId }, err))
    );
  }

  // Push notification
  if (info.pushEnabled) {
    const d = new Date(params.tourData.startsAt);
    const when = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    const prop = params.tourData.propertyAddress ? ` at ${params.tourData.propertyAddress}` : '';
    promises.push(
      sendPushToSpace(params.spaceId, {
        title: `New tour: ${params.tourData.guestName}`,
        body: `${when}${prop}.`,
        url: `/s/${info.spaceSlug}/calendar`,
      }).catch((err) => logger.error('[notify] tour push failed', { spaceId: params.spaceId }, err))
    );
  }

  await Promise.allSettled(promises);
}

// ── New Deal Created ─────────────────────────────────────────────────────

export interface NotifyNewDealParams {
  spaceId: string;
  dealTitle: string;
  dealValue?: number | null;
  dealAddress?: string | null;
  dealPriority?: string | null;
  contactNames?: string[];
}

/**
 * Notify space owner about a new deal via email + SMS.
 * Respects both the channel toggles AND the notifyNewDeals event toggle.
 */
export async function notifyNewDeal(params: NotifyNewDealParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info || !info.notifyNewDeals) return;

  const promises: Promise<unknown>[] = [];

  // Email notification — suppressed when a digest will carry new deals.
  if (info.emailEnabled && !info.emailDigestSuppressed('newDeals')) {
    promises.push(
      sendNewDealNotification({
        toEmail: info.ownerEmail,
        spaceName: info.spaceName,
        spaceSlug: info.spaceSlug,
        dealTitle: params.dealTitle,
        dealValue: params.dealValue,
        dealAddress: params.dealAddress,
        dealPriority: params.dealPriority,
        contactNames: params.contactNames,
      }).catch((err) => logger.error('[notify] deal email failed', { spaceId: params.spaceId }, err))
    );
  }

  // SMS notification
  if (info.smsEnabled && info.ownerPhone) {
    promises.push(
      sendSMS(
        newDealSMS({
          spaceName: info.spaceName,
          dealTitle: params.dealTitle,
          value: params.dealValue != null ? formatCompact(params.dealValue) : null,
          phone: info.ownerPhone,
        })
      ).catch((err) => logger.error('[notify] deal SMS failed', { spaceId: params.spaceId }, err))
    );
  }

  // Push notification
  if (info.pushEnabled) {
    const val = params.dealValue != null ? ` (${formatCompact(params.dealValue)})` : '';
    promises.push(
      sendPushToSpace(params.spaceId, {
        title: `New deal: ${params.dealTitle}${val}`,
        body: `Open ${info.spaceName} to manage it.`,
        url: `/s/${info.spaceSlug}/deals`,
      }).catch((err) => logger.error('[notify] deal push failed', { spaceId: params.spaceId }, err))
    );
  }

  await Promise.allSettled(promises);
}

// ── Workflow scheduled-message dispatch (draft ready / auto-send) ─────────

export interface NotifyWorkflowDispatchParams {
  spaceId: string;
  /** Channel of the scheduled message ('sms' | 'email'). */
  channel: string;
  /** Best-effort recipient display (name or id), for the notification body. */
  recipient?: string | null;
}

/**
 * Notify the space owner that the scheduled-message dispatcher created a DRAFT
 * for them to review (the 'notify' autonomy posture, and the 'auto' safety
 * fallback). This is the "Chippi drafted something — tap to send" nudge; nothing
 * has left. Best-effort, never throws. Push + SMS are immediate (the realtor's
 * own alert, not a client message); gated by the owner's channel toggles.
 */
export async function notifyDraftReady(params: NotifyWorkflowDispatchParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info) return;

  const who = params.recipient ? ` to ${params.recipient}` : '';
  const promises: Promise<unknown>[] = [];

  // Durable in-app record — NOT channel-gated: the bell is where the realtor
  // finds the draft after the (ephemeral) push/SMS has come and gone.
  promises.push(
    createAppNotification({
      spaceId: params.spaceId,
      type: 'agent_send',
      title: 'Chippi drafted a message',
      body: `A ${params.channel} draft${who} is ready to review and send.`,
      href: `/s/${info.spaceSlug}`,
    }),
  );

  if (info.pushEnabled) {
    promises.push(
      sendPushToSpace(params.spaceId, {
        title: 'Chippi drafted a message',
        body: `A ${params.channel} draft${who} is ready to review and send.`,
        url: `/s/${info.spaceSlug}`,
      }).catch((err) => logger.error('[notify] draft-ready push failed', { spaceId: params.spaceId }, err)),
    );
  }

  if (info.smsEnabled && info.ownerPhone) {
    promises.push(
      sendSMS({
        // The realtor's own notification phone — internal, not consumer outreach.
        audience: 'internal',
        to: info.ownerPhone,
        body: `${info.spaceName}: Chippi drafted a ${params.channel}${who} — review & send in the app.`,
      }).catch((err) => logger.error('[notify] draft-ready SMS failed', { spaceId: params.spaceId }, err)),
    );
  }

  await Promise.allSettled(promises);
}

/**
 * Notify the space owner that the dispatcher AUTONOMOUSLY SENT a message (the
 * 'auto' autonomy posture). This is the audit-trail alert required for every
 * autonomous send: the realtor must learn, after the fact, that Chippi sent
 * without a tap. Best-effort, never throws.
 */
export async function notifyAutoSend(params: NotifyWorkflowDispatchParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info) return;

  const who = params.recipient ? ` to ${params.recipient}` : '';
  const promises: Promise<unknown>[] = [];

  // Durable in-app record — NOT channel-gated: every autonomous send must
  // leave an audit trail the realtor can find later, even with push/SMS off.
  promises.push(
    createAppNotification({
      spaceId: params.spaceId,
      type: 'agent_send',
      title: 'Chippi sent a message',
      body: `An automatic ${params.channel}${who} was just sent on your behalf.`,
      href: `/s/${info.spaceSlug}`,
    }),
  );

  if (info.pushEnabled) {
    promises.push(
      sendPushToSpace(params.spaceId, {
        title: 'Chippi sent a message',
        body: `An automatic ${params.channel}${who} was just sent on your behalf.`,
        url: `/s/${info.spaceSlug}`,
      }).catch((err) => logger.error('[notify] auto-send push failed', { spaceId: params.spaceId }, err)),
    );
  }

  if (info.smsEnabled && info.ownerPhone) {
    promises.push(
      sendSMS({
        // The realtor's own notification phone — internal, not consumer outreach.
        audience: 'internal',
        to: info.ownerPhone,
        body: `${info.spaceName}: Chippi auto-sent a ${params.channel}${who}.`,
      }).catch((err) => logger.error('[notify] auto-send SMS failed', { spaceId: params.spaceId }, err)),
    );
  }

  await Promise.allSettled(promises);
}

// ── New Contact (manually added) ─────────────────────────────────────────

export interface NotifyNewContactParams {
  spaceId: string;
  contactName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  tags?: string[];
}

/**
 * Notify space owner about a manually added contact (new lead) via SMS.
 * Only fires if the contact is tagged as 'new-lead'.
 */
export async function notifyNewContact(params: NotifyNewContactParams): Promise<void> {
  // Only notify for contacts tagged as new leads
  if (!params.tags?.includes('new-lead')) return;

  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info || !info.notifyNewLeads) return;

  if (info.smsEnabled && info.ownerPhone) {
    try {
      await sendSMS(
        newLeadSMS({
          spaceName: info.spaceName,
          leadName: params.contactName,
          leadPhone: params.contactPhone,
          phone: info.ownerPhone,
        })
      );
    } catch (err) {
      logger.error('[notify] contact SMS failed', { spaceId: params.spaceId }, err);
    }
  }

  // Push — a manually/agent-added new lead is the same "new lead" event as an
  // inbound application (notifyNewLead), so it gets the same push. Without this
  // the push channel only fired for intake-form leads, silently skipping every
  // lead added by hand or by the add-person tool.
  if (info.pushEnabled) {
    try {
      await sendPushToSpace(params.spaceId, {
        title: `New lead: ${params.contactName}`,
        body: `Open ${info.spaceName} to review.`,
        url: `/s/${info.spaceSlug}/contacts`,
      });
    } catch (err) {
      logger.error('[notify] contact push failed', { spaceId: params.spaceId }, err);
    }
  }
}
