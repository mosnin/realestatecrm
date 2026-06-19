/**
 * Tests the per-event dispatcher's DIGEST-SUPPRESSION integration (lib/notify).
 *
 * The contract that must hold for the feature to be safe:
 *   - DEFAULT-OFF: with cadence 'off' (the default), notifyNewLead/Tour/Deal
 *     send the per-event EMAIL exactly as before — no behavior change.
 *   - DIGEST ON: when the owner's effective cadence is daily/weekly and the
 *     event type is wanted, the per-event EMAIL is suppressed (the digest cron
 *     sends it). SMS and push still fire immediately.
 *
 * resolveEffectivePrefs is mocked so we drive the cadence directly. Email / SMS
 * / push / tour-email helpers are mocked to observe what got dispatched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const sendNewLeadNotification = vi.fn(async (..._a: any[]) => undefined);
const sendNewDealNotification = vi.fn(async (..._a: any[]) => undefined);
vi.mock('@/lib/email', () => ({
  sendNewLeadNotification: (...a: any[]) => sendNewLeadNotification(...a),
  sendNewDealNotification: (...a: any[]) => sendNewDealNotification(...a),
}));

const sendAgentNotification = vi.fn(async (..._a: any[]) => undefined);
vi.mock('@/lib/tour-emails', () => ({ sendAgentNotification: (...a: any[]) => sendAgentNotification(...a) }));

const sendSMS = vi.fn(async (..._a: any[]) => true);
vi.mock('@/lib/sms', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sms')>('@/lib/sms');
  return { ...actual, sendSMS: (...a: any[]) => sendSMS(...a) };
});

const sendPushToSpace = vi.fn(async (..._a: any[]) => 1);
vi.mock('@/lib/push', () => ({ sendPushToSpace: (...a: any[]) => sendPushToSpace(...a) }));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// resolveEffectivePrefs drives cadence; keep the real pure helpers.
const resolveEffectivePrefs = vi.fn();
vi.mock('@/lib/notify-prefs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notify-prefs')>('@/lib/notify-prefs');
  return { ...actual, resolveEffectivePrefs: (...a: unknown[]) => resolveEffectivePrefs(...a) };
});

// Supabase: Space + SpaceSetting(phoneNumber) + User(email, clerkId) lookups in
// getSpaceOwnerInfo. Route by table via maybeSingle.
vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      if (table === 'Space') return Promise.resolve({ data: { ownerId: 'user_1', name: 'Acme', slug: 'acme' } });
      if (table === 'SpaceSetting') return Promise.resolve({ data: { phoneNumber: '+15551234567' } });
      if (table === 'User') return Promise.resolve({ data: { email: 'owner@acme.com', clerkId: 'clerk_1' } });
      return Promise.resolve({ data: null });
    });
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { notifyNewLead, notifyNewDeal } from '@/lib/notify';

const offPrefs = {
  channels: { email: true, sms: true, push: true },
  eventTypes: { newLeads: true, tourBookings: true, newDeals: true, followUps: true },
  digestCadence: 'off' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifyNewLead — digest suppression', () => {
  const params = {
    spaceId: 'space_1',
    contactId: 'c1',
    name: 'Jane',
    phone: '+15559990000',
    applicationData: {},
  };

  it('cadence off (default) → per-event EMAIL is sent (unchanged behavior)', async () => {
    resolveEffectivePrefs.mockResolvedValue(offPrefs);
    await notifyNewLead(params);
    expect(sendNewLeadNotification).toHaveBeenCalledTimes(1);
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendPushToSpace).toHaveBeenCalledTimes(1);
  });

  it('cadence daily → per-event EMAIL suppressed; SMS + push still fire', async () => {
    resolveEffectivePrefs.mockResolvedValue({ ...offPrefs, digestCadence: 'daily' });
    await notifyNewLead(params);
    expect(sendNewLeadNotification).not.toHaveBeenCalled();
    expect(sendSMS).toHaveBeenCalledTimes(1);
    expect(sendPushToSpace).toHaveBeenCalledTimes(1);
  });

  it('cadence daily but newLeads turned off → no email at all (nothing to roll up)', async () => {
    resolveEffectivePrefs.mockResolvedValue({
      ...offPrefs,
      digestCadence: 'daily',
      eventTypes: { ...offPrefs.eventTypes, newLeads: false },
    });
    await notifyNewLead(params);
    // notifyNewLeads=false short-circuits the whole send.
    expect(sendNewLeadNotification).not.toHaveBeenCalled();
    expect(sendSMS).not.toHaveBeenCalled();
    expect(sendPushToSpace).not.toHaveBeenCalled();
  });
});

describe('notifyNewDeal — digest suppression', () => {
  const params = { spaceId: 'space_1', dealTitle: 'Maple sale', dealValue: 500000 };

  it('cadence off → email sent', async () => {
    resolveEffectivePrefs.mockResolvedValue(offPrefs);
    await notifyNewDeal(params);
    expect(sendNewDealNotification).toHaveBeenCalledTimes(1);
  });

  it('cadence weekly → email suppressed, SMS still fires', async () => {
    resolveEffectivePrefs.mockResolvedValue({ ...offPrefs, digestCadence: 'weekly' });
    await notifyNewDeal(params);
    expect(sendNewDealNotification).not.toHaveBeenCalled();
    expect(sendSMS).toHaveBeenCalledTimes(1);
  });
});
