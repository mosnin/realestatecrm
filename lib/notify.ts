/**
 * Unified notification dispatcher.
 *
 * Sends email (via Resend) and SMS (via Telnyx) notifications to space owners
 * based on their notification preferences in SpaceSetting.
 *
 * All functions are non-blocking and never throw.
 */

import { supabase } from '@/lib/supabase';
import { sendNewLeadNotification, type NewLeadEmailParams } from '@/lib/email';
import { sendAgentNotification, type TourEmailData } from '@/lib/tour-emails';
import { sendSMS, newLeadSMS, newTourSMS, newDealSMS } from '@/lib/sms';
import { formatCompact } from '@/lib/formatting';

interface SpaceOwnerInfo {
  ownerEmail: string;
  ownerPhone: string | null;
  spaceName: string;
  spaceSlug: string;
  notifications: boolean;
  smsNotifications: boolean;
}

/**
 * Fetch the space owner's email, phone, and notification preferences.
 * Returns null if space/settings not found.
 */
async function getSpaceOwnerInfo(spaceId: string): Promise<SpaceOwnerInfo | null> {
  try {
    const [{ data: space }, { data: settings }] = await Promise.all([
      supabase.from('Space').select('ownerId, name, slug').eq('id', spaceId).maybeSingle(),
      supabase.from('SpaceSetting').select('notifications, smsNotifications, phoneNumber').eq('spaceId', spaceId).maybeSingle(),
    ]);

    if (!space) return null;

    const { data: owner } = await supabase.from('User').select('email').eq('id', space.ownerId).maybeSingle();
    if (!owner?.email) return null;

    return {
      ownerEmail: owner.email,
      ownerPhone: settings?.phoneNumber ?? null,
      spaceName: space.name,
      spaceSlug: space.slug,
      notifications: settings?.notifications ?? true,
      smsNotifications: settings?.smsNotifications ?? false,
    };
  } catch (err) {
    console.error('[notify] Failed to fetch space owner info', err);
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
  leadScore?: number | null;
  scoreLabel?: string | null;
  scoreSummary?: string | null;
  applicationData: any;
}

/**
 * Notify space owner about a new lead via email + SMS.
 * Non-blocking — fire and forget.
 */
export async function notifyNewLead(params: NotifyNewLeadParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info) return;

  const promises: Promise<unknown>[] = [];

  // Email notification
  if (info.notifications) {
    promises.push(
      sendNewLeadNotification({
        toEmail: info.ownerEmail,
        spaceName: info.spaceName,
        spaceSlug: info.spaceSlug,
        contactId: params.contactId,
        name: params.name,
        phone: params.phone,
        email: params.email,
        leadScore: params.leadScore,
        scoreLabel: params.scoreLabel,
        scoreSummary: params.scoreSummary,
        applicationData: params.applicationData,
      }).catch((err) => console.error('[notify] lead email failed', err))
    );
  }

  // SMS notification
  if (info.smsNotifications && info.ownerPhone) {
    promises.push(
      sendSMS(
        newLeadSMS({
          spaceName: info.spaceName,
          leadName: params.name,
          phone: info.ownerPhone,
          scoreLabel: params.scoreLabel,
        })
      ).catch((err) => console.error('[notify] lead SMS failed', err))
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
 * Non-blocking — fire and forget.
 */
export async function notifyNewTour(params: NotifyNewTourParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info) return;

  const promises: Promise<unknown>[] = [];

  // Email notification to agent
  if (info.notifications) {
    promises.push(
      sendAgentNotification(info.ownerEmail, params.tourData)
        .catch((err) => console.error('[notify] tour email failed', err))
    );
  }

  // SMS notification to agent
  if (info.smsNotifications && info.ownerPhone) {
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
      ).catch((err) => console.error('[notify] tour SMS failed', err))
    );
  }

  await Promise.allSettled(promises);
}

// ── New Deal Created ─────────────────────────────────────────────────────

export interface NotifyNewDealParams {
  spaceId: string;
  dealTitle: string;
  dealValue?: number | null;
}

/**
 * Notify space owner about a new deal via email + SMS.
 * Currently SMS only (email for deals is not yet implemented).
 */
export async function notifyNewDeal(params: NotifyNewDealParams): Promise<void> {
  const info = await getSpaceOwnerInfo(params.spaceId);
  if (!info) return;

  // SMS notification
  if (info.smsNotifications && info.ownerPhone) {
    sendSMS(
      newDealSMS({
        spaceName: info.spaceName,
        dealTitle: params.dealTitle,
        value: params.dealValue != null ? formatCompact(params.dealValue) : null,
        phone: info.ownerPhone,
      })
    ).catch((err) => console.error('[notify] deal SMS failed', err));
  }
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
  if (!info) return;

  if (info.smsNotifications && info.ownerPhone) {
    sendSMS(
      newLeadSMS({
        spaceName: info.spaceName,
        leadName: params.contactName,
        phone: info.ownerPhone,
      })
    ).catch((err) => console.error('[notify] contact SMS failed', err));
  }
}
