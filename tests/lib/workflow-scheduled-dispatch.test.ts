/**
 * Scheduled-message dispatcher + schedule_message action tests.
 *
 * Two units under test, both with everything external mocked via vi.hoisted:
 *
 *  1. executeAction('schedule_message') — asserts it INSERTS a ScheduledMessage
 *     row with the right sendAt offset (now + delayMinutes), autonomy, channel,
 *     and recipient (contact.id ?? lead.id), and returns ok. No send.
 *
 *  2. dispatchDueScheduledMessages — the SAFETY core. Asserts per autonomy:
 *       'draft'  → drafts (runAutonomousInstruction called), status 'drafted',
 *                  NO send (sendSMS/sendDraft never called), NO notify.
 *       'notify' → drafts + notifyDraftReady called, status 'drafted', NO send.
 *       'auto'   → REAL send (sendSMS called), status 'sent', notifyAutoSend
 *                  called, audit row written. [We wired the real send — this
 *                  test reflects the REAL-SEND path, not the safety fallback.]
 *       'auto' over the rate limit → NOT sent, status untouched (deferred).
 *       one failing row doesn't abort the batch (the rest still process).
 *
 * The supabase mock is a chainable builder that records inserts/updates in
 * `calls` and drives the due-row read from `dueRows`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── supabase mock ────────────────────────────────────────────────────────────
// Records every insert/update in `calls`. The ScheduledMessage due query
// (select.eq.lte.order.limit) resolves to `dueRows.value`; the Contact lookup
// (select.eq.eq.maybeSingle) resolves to `contactRow.value`; the SpaceSetting
// lookup resolves to `spaceSettingRow.value`.
const { calls, dueRows, contactRow, spaceSettingRow, claimRows, recentSentCount } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: 'insert' | 'update' | 'count'; payload: unknown; filters?: Array<[string, unknown]> }>,
  dueRows: { value: [] as unknown[] },
  contactRow: { value: null as unknown },
  spaceSettingRow: { value: null as unknown },
  // Rows the guarded claim UPDATE … .select('id') resolves to. Non-empty = the
  // 'pending'→'sending' flip won (claimed); empty = lost the claim (skipped).
  claimRows: { value: [{ id: 'claimed' }] as unknown[] },
  // The count the recent-sent-count query resolves to (RAIL 1 denominator).
  recentSentCount: { value: 0 },
}));

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {
      insert: (payload: unknown) => {
        calls.push({ table, op: 'insert', payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: unknown) => {
        // Record the eq() filters on this update so tests can assert the claim's
        // guard (.eq('status','pending')) distinguishes it from a terminal setStatus.
        const filters: Array<[string, unknown]> = [];
        calls.push({ table, op: 'update', payload, filters });
        // The chain is both thenable (terminal setStatus: update.eq → { error })
        // and exposes select (the claim: update.eq.eq.select('id') → { data }).
        const chain: Record<string, unknown> = {
          eq: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          // The stale-claim reclaim: update.eq('status','sending').lt('updatedAt', …).select('id').
          lt: (col: string, val: unknown) => {
            filters.push([col, val]);
            return chain;
          },
          select: () => {
            // The reclaim sweep returns no stale rows by default; the claim
            // flip returns the test-controlled claimRows.
            const isReclaim = filters.some(([col, val]) => col === 'status' && val === 'sending');
            return Promise.resolve({ data: isReclaim ? [] : claimRows.value, error: null });
          },
          then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
        };
        return chain;
      },
      select: (_cols?: unknown, opts?: { count?: string; head?: boolean }) => {
        // The recent-sent-count query (RAIL 1): select('id', { count, head })
        // .eq.eq.gte → resolves { count, error }. Distinguished by the count opt.
        if (opts && typeof opts === 'object' && 'count' in opts) {
          calls.push({ table, op: 'count', payload: opts });
          const countChain: Record<string, unknown> = {
            eq: () => countChain,
            gte: () => countChain,
            then: (resolve: (v: { count: number; error: null }) => unknown) =>
              resolve({ count: recentSentCount.value, error: null }),
          };
          return countChain;
        }
        // A chain that is both thenable (the due-row list query) and exposes
        // maybeSingle (the Contact / SpaceSetting single-row lookups). Which
        // single-row source it returns is decided by `table`.
        const chain: Record<string, unknown> = {
          eq: () => chain,
          lte: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () =>
            Promise.resolve({
              data:
                table === 'Contact'
                  ? contactRow.value
                  : table === 'Space'
                    ? { ownerId: 'user-1' }
                    : table === 'User'
                      ? { clerkId: 'clerk_1' }
                      : spaceSettingRow.value,
              error: null,
            }),
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            resolve({ data: dueRows.value, error: null }),
        };
        return chain;
      },
    };
    return builder;
  };
  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

// ── headless agent runner mock ───────────────────────────────────────────────
const { runAutonomousInstructionMock } = vi.hoisted(() => ({
  runAutonomousInstructionMock: vi.fn(),
}));
vi.mock('@/lib/agent/run-instruction', () => ({
  runAutonomousInstruction: runAutonomousInstructionMock,
  // executeAction (actions.ts) also imports buildHeadlessToolContext.
  buildHeadlessToolContext: vi.fn(),
}));

// ── transports + helpers ─────────────────────────────────────────────────────
const {
  sendSMSMock,
  sendDraftMock,
  checkSendAllowedMock,
  recordOutboundMock,
  notifyDraftReadyMock,
  notifyAutoSendMock,
} =
  vi.hoisted(() => ({
    sendSMSMock: vi.fn(),
    sendDraftMock: vi.fn(),
    checkSendAllowedMock: vi.fn(),
    recordOutboundMock: vi.fn(),
    notifyDraftReadyMock: vi.fn(),
    notifyAutoSendMock: vi.fn(),
  }));

vi.mock('@/lib/sms', () => ({ sendSMS: sendSMSMock }));
vi.mock('@/lib/delivery', () => ({
  sendDraft: sendDraftMock,
  describeDelivery: (r: { method?: string; fallback?: boolean }) =>
    r.method === 'gmail'
      ? 'from your Gmail'
      : r.fallback
        ? "from Chippi's sender (your inbox failed — reconnect to send as yourself)"
        : "from Chippi's sender (connect Gmail or Outlook to send as yourself)",
}));
vi.mock('@/lib/messaging/compliance', () => ({
  checkSendAllowed: checkSendAllowedMock,
}));
vi.mock('@/lib/inbox', () => ({ recordOutboundMessageSafe: recordOutboundMock }));
vi.mock('@/lib/notify', () => ({
  notifyDraftReady: notifyDraftReadyMock,
  notifyAutoSend: notifyAutoSendMock,
}));

import { dispatchDueScheduledMessages } from '@/lib/workflows/scheduled-dispatch';
import { executeAction } from '@/lib/workflows/actions';
import type { WorkflowAction } from '@/lib/workflows/schema';

beforeEach(() => {
  calls.length = 0;
  dueRows.value = [];
  contactRow.value = null;
  spaceSettingRow.value = null;
  claimRows.value = [{ id: 'claimed' }]; // default: the claim succeeds (one row flipped).
  recentSentCount.value = 0; // default: under the cap.
  runAutonomousInstructionMock.mockReset();
  runAutonomousInstructionMock.mockResolvedValue({ ok: true, ran: true, summary: 'drafted' });
  sendSMSMock.mockReset();
  sendSMSMock.mockResolvedValue(true);
  sendDraftMock.mockReset();
  sendDraftMock.mockResolvedValue({ sent: true, method: 'gmail' });
  checkSendAllowedMock.mockReset();
  checkSendAllowedMock.mockResolvedValue({ allowed: true });
  recordOutboundMock.mockReset();
  recordOutboundMock.mockResolvedValue(null);
  notifyDraftReadyMock.mockReset();
  notifyDraftReadyMock.mockResolvedValue(undefined);
  notifyAutoSendMock.mockReset();
  notifyAutoSendMock.mockResolvedValue(undefined);
});

// ── helpers ──────────────────────────────────────────────────────────────────

function scheduledInsert() {
  return calls.find((c) => c.table === 'ScheduledMessage' && c.op === 'insert')?.payload as
    | Record<string, unknown>
    | undefined;
}

function statusUpdates() {
  return calls
    .filter(
      (c) =>
        c.table === 'ScheduledMessage' &&
        c.op === 'update' &&
        // Exclude the stale-claim reclaim sweep that opens every dispatch
        // tick (update filtered on .eq('status','sending')) — these tests
        // assert on per-row status transitions.
        !c.filters?.some(([col, val]) => col === 'status' && val === 'sending'),
    )
    .map((c) => c.payload as Record<string, unknown>);
}

/** The guarded claim: a status→'sending' update filtered on .eq('status','pending'). */
function claimUpdates() {
  return calls.filter(
    (c) =>
      c.table === 'ScheduledMessage' &&
      c.op === 'update' &&
      (c.payload as Record<string, unknown>).status === 'sending' &&
      (c.filters ?? []).some(([col, val]) => col === 'status' && val === 'pending'),
  );
}

/** The claim RELEASE: a status→'pending' update filtered on .eq('status','sending'). */
function releaseUpdates() {
  return calls.filter(
    (c) =>
      c.table === 'ScheduledMessage' &&
      c.op === 'update' &&
      (c.payload as Record<string, unknown>).status === 'pending' &&
      (c.filters ?? []).some(([col, val]) => col === 'status' && val === 'sending'),
  );
}

/** The recent-sent-count query (RAIL 1 denominator). */
function countQueries() {
  return calls.filter((c) => c.table === 'ScheduledMessage' && c.op === 'count');
}

const CONTACT = { id: 'contact-1', name: 'Jane', email: 'jane@example.com', phone: '+15551234567' };

// ═════════════════════════════════════════════════════════════════════════════
// 1. schedule_message action — records a ScheduledMessage row.
// ═════════════════════════════════════════════════════════════════════════════

describe('executeAction: schedule_message', () => {
  it('inserts a ScheduledMessage with correct sendAt offset, autonomy, channel, recipient', async () => {
    const action: WorkflowAction = {
      type: 'schedule_message',
      config: { channel: 'sms', instruction: 'Follow up after the tour', delayMinutes: 60 },
    };
    const before = Date.now();
    const result = await executeAction(
      action,
      { contact: { id: 'contact-1', name: 'Jane' } },
      { spaceId: 'space-1', autonomy: 'auto', runId: 'run-1' },
    );
    const after = Date.now();

    expect(result.status).toBe('ok');

    const row = scheduledInsert();
    expect(row).toBeDefined();
    expect(row!.spaceId).toBe('space-1');
    expect(row!.channel).toBe('sms');
    expect(row!.autonomy).toBe('auto');
    expect(row!.recipientContactId).toBe('contact-1');
    expect(row!.runId).toBe('run-1');
    expect(row!.status).toBe('pending');
    expect(row!.instruction).toBe('Follow up after the tour');

    // sendAt ≈ now + 60min (within the test's wall-clock window).
    const sendAtMs = new Date(row!.sendAt as string).getTime();
    expect(sendAtMs).toBeGreaterThanOrEqual(before + 60 * 60_000);
    expect(sendAtMs).toBeLessThanOrEqual(after + 60 * 60_000);

    // No send at action time.
    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
  });

  it('falls back to lead.id when no contact is present', async () => {
    const action: WorkflowAction = {
      type: 'schedule_message',
      config: { channel: 'email', instruction: 'Welcome', delayMinutes: 0 },
    };
    await executeAction(
      action,
      { lead: { id: 'lead-9' } },
      { spaceId: 'space-1', autonomy: 'draft' },
    );
    expect(scheduledInsert()!.recipientContactId).toBe('lead-9');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. dispatcher — autonomy enforcement (the safety core).
// ═════════════════════════════════════════════════════════════════════════════

describe('dispatchDueScheduledMessages: autonomy enforcement', () => {
  it("'draft' → drafts, status 'drafted', NEVER sends and NEVER notifies", async () => {
    dueRows.value = [
      { id: 'sm-1', spaceId: 'space-1', channel: 'sms', recipientContactId: 'contact-1', instruction: 'hi', autonomy: 'draft' },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(runAutonomousInstructionMock).toHaveBeenCalledTimes(1);
    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(notifyDraftReadyMock).not.toHaveBeenCalled();
    expect(notifyAutoSendMock).not.toHaveBeenCalled();

    const updates = statusUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('drafted');
    expect(summary).toMatchObject({ due: 1, drafted: 1, sent: 0 });
  });

  it("'notify' → drafts + notifyDraftReady, status 'drafted', NEVER sends", async () => {
    dueRows.value = [
      { id: 'sm-2', spaceId: 'space-1', channel: 'email', recipientContactId: 'contact-1', instruction: 'hi', autonomy: 'notify' },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(runAutonomousInstructionMock).toHaveBeenCalledTimes(1);
    expect(notifyDraftReadyMock).toHaveBeenCalledTimes(1);
    expect(notifyDraftReadyMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-1', channel: 'email' }),
    );
    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(notifyAutoSendMock).not.toHaveBeenCalled();

    expect(statusUpdates()[0].status).toBe('drafted');
    expect(summary).toMatchObject({ drafted: 1, sent: 0 });
  });

  it("'auto' → REAL send via sendSMS, status 'sent', audited + notifyAutoSend (real-send path)", async () => {
    contactRow.value = CONTACT;
    dueRows.value = [
      { id: 'sm-3', spaceId: 'space-1', channel: 'sms', recipientContactId: 'contact-1', instruction: 'Your tour is confirmed', autonomy: 'auto' },
    ];

    // Capture the ScheduledMessage update snapshot the instant the send fires, to
    // prove RAIL 0 (the claim) ran BEFORE the irreversible send.
    let updatesAtSendTime: Record<string, unknown>[] = [];
    sendSMSMock.mockImplementation(async () => {
      updatesAtSendTime = statusUpdates();
      return true;
    });

    const summary = await dispatchDueScheduledMessages();

    // RAIL 0: CLAIM — a guarded 'pending'→'sending' update ran BEFORE the send.
    // At send time exactly the claim update was on record (status 'sending'); the
    // terminal 'sent' update is written only AFTER the send returns.
    expect(updatesAtSendTime).toHaveLength(1);
    expect(updatesAtSendTime[0].status).toBe('sending');
    // The claim was guarded on the prior status (.eq('status','pending')).
    expect(claimUpdates()).toHaveLength(1);
    // RAIL 1: rate limit checked AFTER the claim via a recent-sent-count query.
    expect(countQueries()).toHaveLength(1);
    // REAL SEND happened.
    // Autonomous consumer outreach MUST be classified for the TCPA gate
    // (lib/messaging/compliance.ts): an unlabelled send would skip consent,
    // opt-out, and quiet-hours enforcement on the product's highest-risk path.
    expect(sendSMSMock).toHaveBeenCalledWith({
      to: CONTACT.phone,
      body: 'Your tour is confirmed',
      audience: 'consumer',
      category: 'marketing',
      spaceId: 'space-1',
      contactId: CONTACT.id,
    });
    // No drafting on the auto path.
    expect(runAutonomousInstructionMock).not.toHaveBeenCalled();
    // RAIL 2: audit — a ContactActivity row + inbox transcript.
    expect(calls.some((c) => c.table === 'ContactActivity' && c.op === 'insert')).toBe(true);
    expect(recordOutboundMock).toHaveBeenCalledTimes(1);
    // RAIL 3: realtor notified after the fact.
    expect(notifyAutoSendMock).toHaveBeenCalledTimes(1);

    // Two updates now: the claim ('sending') then the terminal ('sent').
    const updates = statusUpdates();
    expect(updates).toHaveLength(2);
    expect(updates[0].status).toBe('sending');
    expect(updates[1].status).toBe('sent');
    expect((updates[1].detail as Record<string, unknown>).deliveredTo).toBe(CONTACT.phone);
    expect(summary).toMatchObject({ sent: 1, drafted: 0, deferred: 0, failed: 0, skipped: 0 });
  });

  it("'auto' at/over the recent-send cap → claim RELEASED back to 'pending', NOT sent (deferred)", async () => {
    recentSentCount.value = 20; // at the cap (AUTO_SEND_MAX).
    contactRow.value = CONTACT;
    dueRows.value = [
      { id: 'sm-4', spaceId: 'space-1', channel: 'sms', recipientContactId: 'contact-1', instruction: 'hi', autonomy: 'auto' },
    ];

    const summary = await dispatchDueScheduledMessages();

    // The claim was taken, then the count gate tripped → release it.
    expect(claimUpdates()).toHaveLength(1);
    expect(countQueries()).toHaveLength(1);
    expect(releaseUpdates()).toHaveLength(1);

    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(notifyAutoSendMock).not.toHaveBeenCalled();
    // No terminal 'sent'/'failed' write — the row is back to 'pending'.
    expect(statusUpdates().some((u) => u.status === 'sent' || u.status === 'failed')).toBe(false);
    expect(summary).toMatchObject({ deferred: 1, sent: 0, failed: 0 });
  });

  it("'auto' under the cap → sends (the count gate lets it through)", async () => {
    recentSentCount.value = 19; // under AUTO_SEND_MAX.
    contactRow.value = CONTACT;
    dueRows.value = [
      { id: 'sm-4b', spaceId: 'space-1', channel: 'sms', recipientContactId: 'contact-1', instruction: 'hi', autonomy: 'auto' },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(countQueries()).toHaveLength(1);
    expect(releaseUpdates()).toHaveLength(0);
    expect(sendSMSMock).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ sent: 1, deferred: 0 });
  });

  it("'auto' whose claim flips zero rows → NOT sent, status untouched (skipped)", async () => {
    // Another tick already owns this row (or a crash left it 'sending'): the
    // guarded 'pending'→'sending' UPDATE matches nothing, so claimForSend returns
    // false. We must NOT send and must NOT overwrite status.
    claimRows.value = []; // claim flips zero rows.
    contactRow.value = CONTACT;
    dueRows.value = [
      { id: 'sm-8', spaceId: 'space-1', channel: 'sms', recipientContactId: 'contact-1', instruction: 'hi', autonomy: 'auto' },
    ];

    const summary = await dispatchDueScheduledMessages();

    // The claim was attempted (guarded), but lost.
    expect(claimUpdates()).toHaveLength(1);
    // A lost claim does no rate-limit work — the count query is NOT run.
    expect(countQueries()).toHaveLength(0);
    // No real send, no audit, no notify.
    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(recordOutboundMock).not.toHaveBeenCalled();
    expect(notifyAutoSendMock).not.toHaveBeenCalled();
    // Status is NOT overwritten — only the claim update exists (the 'sending'
    // flip itself matched nothing), no terminal 'sent'/'failed' write.
    expect(statusUpdates().some((u) => u.status === 'sent' || u.status === 'failed')).toBe(false);
    expect(summary).toMatchObject({ skipped: 1, sent: 0, deferred: 0, failed: 0 });
  });

  it('one failing row does not abort the batch', async () => {
    // Row 1 is 'auto' but the contact is missing → that row FAILS. Row 2 is a
    // 'draft' that should still process to 'drafted'.
    contactRow.value = null; // Contact lookup returns nothing → auto row fails.
    dueRows.value = [
      { id: 'sm-5', spaceId: 'space-1', channel: 'sms', recipientContactId: 'missing', instruction: 'hi', autonomy: 'auto' },
      { id: 'sm-6', spaceId: 'space-1', channel: 'sms', recipientContactId: 'contact-1', instruction: 'hi', autonomy: 'draft' },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(summary.due).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.drafted).toBe(1);

    const updates = statusUpdates();
    const byStatus = updates.map((u) => u.status).sort();
    expect(byStatus).toEqual(['drafted', 'failed']);
    // The second row still drafted despite the first failing.
    expect(runAutonomousInstructionMock).toHaveBeenCalledTimes(1);
  });

  it("'auto' with a throwing transport → row 'failed', batch continues", async () => {
    contactRow.value = CONTACT;
    sendSMSMock.mockRejectedValueOnce(new Error('telnyx exploded'));
    dueRows.value = [
      { id: 'sm-7', spaceId: 'space-1', channel: 'sms', recipientContactId: 'contact-1', instruction: 'hi', autonomy: 'auto' },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(summary.failed).toBe(1);
    // The row was claimed ('sending') then the send threw → terminal 'failed'.
    const updates = statusUpdates();
    expect(updates.map((u) => u.status)).toEqual(['sending', 'failed']);
    expect(notifyAutoSendMock).not.toHaveBeenCalled();
  });

  it("'auto' email sends as the realtor via sendDraft", async () => {
    spaceSettingRow.value = { businessName: 'Jane Realty' };
    contactRow.value = CONTACT;
    dueRows.value = [
      {
        id: 'sm-email',
        spaceId: 'space-1',
        channel: 'email',
        recipientContactId: 'contact-1',
        instruction: 'Checking in after the tour',
        autonomy: 'auto',
      },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(summary).toMatchObject({ sent: 1, failed: 0 });
    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        channel: 'email',
        address: 'jane@example.com',
        audience: 'consumer',
        category: 'marketing',
        contactId: 'contact-1',
      }),
    );
    expect(sendDraftMock).toHaveBeenCalledWith(
      { channel: 'email', subject: 'Message from Jane Realty', content: 'Checking in after the tour' },
      { name: 'Jane', email: 'jane@example.com', phone: '+15551234567' },
      'Jane Realty',
      { spaceId: 'space-1', userId: 'clerk_1' },
    );
    expect(sendSMSMock).not.toHaveBeenCalled();
    expect(notifyAutoSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        channel: 'email',
        via: 'from your Gmail',
      }),
    );
    expect(
      statusUpdates().some(
        (u) => u.status === 'sent' && (u.detail as { via?: string } | undefined)?.via === 'from your Gmail',
      ),
    ).toBe(true);
  });

  it("'auto' email blocked by compliance stays unsent", async () => {
    contactRow.value = CONTACT;
    checkSendAllowedMock.mockResolvedValueOnce({
      allowed: false,
      reason: 'no_consent',
      detail: 'no express written consent on file',
    });
    dueRows.value = [
      {
        id: 'sm-block',
        spaceId: 'space-1',
        channel: 'email',
        recipientContactId: 'contact-1',
        instruction: 'hi',
        autonomy: 'auto',
      },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(summary).toMatchObject({ failed: 1, sent: 0 });
    expect(sendDraftMock).not.toHaveBeenCalled();
    expect(claimUpdates()).toHaveLength(0);
    expect(
      statusUpdates().some((u) =>
        String((u.detail as { error?: string } | undefined)?.error ?? '').startsWith('Blocked because'),
      ),
    ).toBe(true);
  });

  it("'auto' email labels a failed inbox and does not pretend it sent", async () => {
    contactRow.value = CONTACT;
    sendDraftMock.mockResolvedValueOnce({ sent: false, method: 'email', error: 'not_configured' });
    dueRows.value = [
      {
        id: 'sm-fail',
        spaceId: 'space-1',
        channel: 'email',
        recipientContactId: 'contact-1',
        instruction: 'hi',
        autonomy: 'auto',
      },
    ];

    const summary = await dispatchDueScheduledMessages();

    expect(summary).toMatchObject({ failed: 1, sent: 0 });
    expect(notifyAutoSendMock).not.toHaveBeenCalled();
  });
});
