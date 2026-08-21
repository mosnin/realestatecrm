/**
 * Behavioral tenant isolation for leftover Tour / Property / Contact tool
 * mutates. A foreign id must not return the victim row and must not write
 * Tour, Property, Contact, or ContactActivity.
 *
 * The supabase mock applies recorded `.eq` / `.is` filters (including the
 * spaceId tenantTable() pre-applies) so a forgotten scope filter would
 * leak the victim row and fail these tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
type Write = {
  op: 'insert' | 'update' | 'delete';
  table: string;
  filters: Record<string, unknown>;
  values?: unknown;
};

const CALLER_SPACE = 'space_caller';
const VICTIM_SPACE = 'space_victim';

let tables: Record<string, Row[]>;
let writes: Write[];

function matches(row: Row, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([key, value]) => row[key] === value);
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const filters: Record<string, unknown> = {};
    let pending: Write | null = null;
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return chain;
    });
    chain.is = vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return chain;
    });
    chain.in = vi.fn(passthrough);
    chain.neq = vi.fn(passthrough);
    chain.order = vi.fn(passthrough);
    chain.limit = vi.fn(passthrough);
    chain.not = vi.fn(passthrough);
    chain.gte = vi.fn(passthrough);
    chain.lte = vi.fn(passthrough);
    chain.update = vi.fn((values: unknown) => {
      pending = { op: 'update', table, filters, values };
      return chain;
    });
    chain.delete = vi.fn(() => {
      pending = { op: 'delete', table, filters };
      return chain;
    });
    chain.insert = vi.fn((values: unknown) => {
      writes.push({ op: 'insert', table, filters: { ...filters }, values });
      return chain;
    });
    const matching = () => (tables[table] ?? []).filter((row) => matches(row, filters));
    const settle = () => {
      if (pending) {
        writes.push({ ...pending, filters: { ...filters } });
        pending = null;
      }
      const rows = matching();
      return { data: rows, error: null, count: rows.length };
    };
    chain.maybeSingle = vi.fn(() => {
      const rows = matching();
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    });
    chain.single = vi.fn(() => {
      const rows = matching();
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/vectorize', () => ({
  syncContact: vi.fn(async () => undefined),
  syncDeal: vi.fn(async () => undefined),
  deleteContactVector: vi.fn(async () => undefined),
  deleteDealVector: vi.fn(async () => undefined),
}));

vi.mock('@/lib/gcal-helpers', () => ({
  deleteGoogleEvent: vi.fn(async () => true),
}));

vi.mock('@/lib/calendar/mirror', () => ({
  findCalendarConnection: vi.fn(async () => null),
  writeEventThrough: vi.fn(async () => undefined),
  updateEventThrough: vi.fn(async () => undefined),
  deleteEventThrough: vi.fn(async () => undefined),
}));

vi.mock('@/lib/tour-notify', () => ({
  notifyTourRescheduled: vi.fn(async () => undefined),
  notifyTourCancelled: vi.fn(async () => undefined),
}));

const bookTourAtomic = vi.fn();
vi.mock('@/lib/tour-booking', () => ({
  bookTourAtomic: (...args: unknown[]) => bookTourAtomic(...args),
  generateManageToken: () => 'tok_test',
}));

vi.mock('@/lib/billing/meter', () => ({
  assertCanSpend: vi.fn(async () => undefined),
  chargeWorkflow: vi.fn(async () => undefined),
  CreditsExhaustedError: class CreditsExhaustedError extends Error {},
  SubscriptionDelinquentError: class SubscriptionDelinquentError extends Error {},
}));

const copyObject = vi.fn(async () => undefined);
vi.mock('@/lib/storage', () => ({
  copyObject: (...args: unknown[]) => copyObject(...args),
  getPublicUrl: () => 'https://cdn.example/photo.jpg',
  buildKey: () => 'property-photos/space/prop/file.jpg',
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { deleteTourTool } from '@/lib/ai-tools/tools/delete-tour';
import { cancelTourTool } from '@/lib/ai-tools/tools/cancel-tour';
import { rescheduleTourTool } from '@/lib/ai-tools/tools/reschedule-tour';
import { scheduleTourTool } from '@/lib/ai-tools/tools/schedule-tour';
import { deletePropertyTool } from '@/lib/ai-tools/tools/delete-property';
import { updatePropertyStatusTool } from '@/lib/ai-tools/tools/update-property-status';
import { noteOnPropertyTool } from '@/lib/ai-tools/tools/note-on-property';
import { attachFileToPropertyTool } from '@/lib/ai-tools/tools/attach-file-to-property';
import { logCallTool } from '@/lib/ai-tools/tools/log-call';
import { logMeetingTool } from '@/lib/ai-tools/tools/log-meeting';
import { mergePersonsTool } from '@/lib/ai-tools/tools/merge-persons';
import { noteOnPersonTool } from '@/lib/ai-tools/tools/note-on-person';
import { logEmailSentTool } from '@/lib/ai-tools/tools/log-email-sent';
import { logSmsSentTool } from '@/lib/ai-tools/tools/log-sms-sent';
import { sendPropertyPacketTool } from '@/lib/ai-tools/tools/send-property-packet';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_caller',
    space: { id: CALLER_SPACE, slug: 'caller', name: 'Caller Realty', ownerId: 'user_caller' },
    signal: new AbortController().signal,
  };
}

function seedVictimWorld() {
  tables = {
    Tour: [
      {
        id: 'tour_victim',
        spaceId: VICTIM_SPACE,
        contactId: 'c_victim',
        guestName: 'VICTIM Guest',
        guestEmail: 'signer@victim.com',
        guestPhone: '555-0100',
        propertyAddress: '123 Victim Lane',
        startsAt: '2026-09-01T17:00:00.000Z',
        endsAt: '2026-09-01T18:00:00.000Z',
        status: 'scheduled',
        googleEventId: 'gcal_victim',
      },
      {
        id: 'tour_own',
        spaceId: CALLER_SPACE,
        contactId: 'c_own',
        guestName: 'Own Guest',
        guestEmail: 'own@example.com',
        guestPhone: null,
        propertyAddress: '10 Own St',
        startsAt: '2026-09-02T17:00:00.000Z',
        endsAt: '2026-09-02T18:00:00.000Z',
        status: 'scheduled',
        googleEventId: null,
      },
    ],
    Property: [
      {
        id: 'prop_victim',
        spaceId: VICTIM_SPACE,
        address: '123 Victim Lane',
        listingStatus: 'active',
        notes: 'VICTIM private notes',
        photos: ['https://cdn.example/victim.jpg'],
      },
      {
        id: 'prop_own',
        spaceId: CALLER_SPACE,
        address: '10 Own St',
        listingStatus: 'active',
        notes: '',
        photos: [],
      },
    ],
    Contact: [
      {
        id: 'c_victim',
        spaceId: VICTIM_SPACE,
        name: 'VICTIM Chen',
        email: 'signer@victim.com',
        phone: '555-0100',
        brokerageId: null,
      },
      {
        id: 'c_keep_victim',
        spaceId: VICTIM_SPACE,
        name: 'VICTIM Keep',
        email: 'keep@victim.com',
        phone: null,
        brokerageId: null,
      },
      {
        id: 'c_own',
        spaceId: CALLER_SPACE,
        name: 'Own Contact',
        email: 'own@example.com',
        phone: '555-0199',
        brokerageId: null,
      },
    ],
    File: [
      {
        id: 'file_victim',
        spaceId: VICTIM_SPACE,
        name: 'secret.pdf',
        mimeType: 'image/jpeg',
        category: 'image',
        storageKey: 'files/victim/secret.jpg',
      },
      {
        id: 'file_own',
        spaceId: CALLER_SPACE,
        name: 'listing.jpg',
        mimeType: 'image/jpeg',
        category: 'image',
        storageKey: 'files/own/listing.jpg',
      },
    ],
    ContactActivity: [],
    DealContact: [],
  };
}

function writesOn(table: string) {
  return writes.filter((w) => w.table === table);
}

function noPii(summary: string) {
  expect(summary).not.toContain('VICTIM');
  expect(summary).not.toContain('555-0100');
  expect(summary).not.toContain('signer@victim.com');
  expect(summary).not.toContain('123 Victim Lane');
  expect(summary).not.toContain('secret.pdf');
  expect(summary).not.toContain('Forbidden');
}

beforeEach(() => {
  writes = [];
  seedVictimWorld();
  bookTourAtomic.mockReset();
  copyObject.mockReset();
});

describe('Tour tool IDOR — foreign tourId does not mutate', () => {
  it('delete_tour misses a foreign tour and does not delete', async () => {
    const result = await deleteTourTool.handler(
      { tourId: 'tour_victim', reason: 'cleanup' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Tour')).toEqual([]);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('delete_tour still deletes a same-space tour', async () => {
    const result = await deleteTourTool.handler(
      { tourId: 'tour_own', reason: 'cleanup' },
      makeCtx(),
    );
    expect(result.display).toBe('success');
    expect(writesOn('Tour').some((w) => w.op === 'delete')).toBe(true);
  });

  it('cancel_tour misses a foreign tour and does not update', async () => {
    const result = await cancelTourTool.handler(
      { tourId: 'tour_victim', reason: 'buyer cancelled' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Tour')).toEqual([]);
  });

  it('reschedule_tour misses a foreign tour and does not update', async () => {
    const result = await rescheduleTourTool.handler(
      {
        tourId: 'tour_victim',
        newStartsAt: '2026-09-03T17:00:00.000Z',
        newEndsAt: '2026-09-03T18:00:00.000Z',
      },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Tour')).toEqual([]);
  });

  it('schedule_tour refuses a foreign contact and does not book', async () => {
    const result = await scheduleTourTool.handler(
      {
        contactId: 'c_victim',
        startsAt: '2026-09-04T17:00:00.000Z',
        endsAt: '2026-09-04T18:00:00.000Z',
      },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(bookTourAtomic).not.toHaveBeenCalled();
  });
});

describe('Property tool IDOR — foreign propertyId does not mutate', () => {
  it('delete_property misses a foreign listing and does not delete', async () => {
    const result = await deletePropertyTool.handler(
      { propertyId: 'prop_victim', reason: 'cleanup' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Property')).toEqual([]);
  });

  it('update_property_status misses a foreign listing and does not update', async () => {
    const result = await updatePropertyStatusTool.handler(
      { propertyId: 'prop_victim', newStatus: 'sold' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Property')).toEqual([]);
  });

  it('note_on_property misses a foreign listing and does not update', async () => {
    const result = await noteOnPropertyTool.handler(
      { propertyId: 'prop_victim', content: 'offer incoming' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Property')).toEqual([]);
  });

  it('attach_file_to_property misses a foreign listing and does not copy or update', async () => {
    const result = await attachFileToPropertyTool.handler(
      { fileId: 'file_own', propertyId: 'prop_victim' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(copyObject).not.toHaveBeenCalled();
    expect(writesOn('Property')).toEqual([]);
  });

  it('attach_file_to_property misses a foreign file and does not copy or update', async () => {
    const result = await attachFileToPropertyTool.handler(
      { fileId: 'file_victim', propertyId: 'prop_own' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(copyObject).not.toHaveBeenCalled();
    expect(writesOn('Property')).toEqual([]);
  });
});

describe('Contact tool IDOR — foreign personId does not mutate', () => {
  it('log_call misses a foreign contact and does not write', async () => {
    const result = await logCallTool.handler(
      { personId: 'c_victim', summary: 'Walked through Friday tour.' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Contact')).toEqual([]);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('log_meeting misses a foreign contact and does not write', async () => {
    const result = await logMeetingTool.handler(
      { personId: 'c_victim', summary: 'Met at the listing.' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Contact')).toEqual([]);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('note_on_person misses a foreign contact and does not insert activity', async () => {
    const result = await noteOnPersonTool.handler(
      { personId: 'c_victim', content: 'liked the kitchen' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('log_email_sent misses a foreign contact and does not insert activity', async () => {
    const result = await logEmailSentTool.handler(
      { personId: 'c_victim', subject: 'Follow up', body: 'Checking in' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('log_sms_sent misses a foreign contact and does not insert activity', async () => {
    const result = await logSmsSentTool.handler(
      { personId: 'c_victim', body: 'On my way' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('send_property_packet misses a foreign contact and does not insert activity', async () => {
    const result = await sendPropertyPacketTool.handler(
      { contactId: 'c_victim', propertyId: 'prop_own' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('send_property_packet misses a foreign property and does not insert activity', async () => {
    const result = await sendPropertyPacketTool.handler(
      { contactId: 'c_own', propertyId: 'prop_victim' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('ContactActivity')).toEqual([]);
  });

  it('merge_persons misses a foreign merge target and does not delete', async () => {
    const result = await mergePersonsTool.handler(
      { keepId: 'c_own', mergeId: 'c_victim' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Contact').filter((w) => w.op === 'delete')).toEqual([]);
    expect(writesOn('ContactActivity').filter((w) => w.op === 'update')).toEqual([]);
    expect(writesOn('Tour').filter((w) => w.op === 'update')).toEqual([]);
  });

  it('merge_persons misses a foreign keep target and does not delete', async () => {
    const result = await mergePersonsTool.handler(
      { keepId: 'c_keep_victim', mergeId: 'c_own' },
      makeCtx(),
    );
    expect(result.display).toBe('error');
    noPii(result.summary);
    expect(writesOn('Contact').filter((w) => w.op === 'delete')).toEqual([]);
  });
});
