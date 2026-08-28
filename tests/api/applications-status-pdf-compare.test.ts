/**
 * Realtor application status / PDF / compare — remaining fail-closed rules.
 *
 * IDOR suites already lock deny-then-no-write for PATCH /api/applications/status
 * and deny-then-no-Contact for GET /api/applications/compare. These tests cover
 * the gaps those suites skip:
 *
 *   1. PATCH /status rejects missing/invalid payloads before auth or Contact
 *      lookup, accepts needs_info (unlike /[id]/status), and on allow writes
 *      Contact + ApplicationStatusUpdate in the caller space.
 *   2. GET /pdf rejects a missing contactId before auth, returns the deny
 *      response without reading Contact, 404s a scoped miss, 400s a contact
 *      with no applicationData (no HTML leak), and on allow returns HTML
 *      scoped to the caller space.
 *   3. GET /compare rejects missing slug/ids before auth, rejects a single
 *      id after auth without querying Contact, caps ids at 10, and lists
 *      only contacts in the caller space.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  requireContactAccess,
  requireSpaceOwner,
  eqCalls,
  inCalls,
  inserts,
  updates,
  CALLER,
  CONTACT,
  APPLICATION,
  makeChain,
  setContact,
  setContacts,
} = vi.hoisted(() => {
  const eqCalls: { table: string; column: string; value: unknown }[] = [];
  const inCalls: { table: string; column: string; values: unknown }[] = [];
  const inserts: { table: string; values: Record<string, unknown> }[] = [];
  const updates: { table: string; payload: Record<string, unknown> }[] = [];
  const CALLER = { id: 'sp_own', slug: 'jane', name: 'Jane Realty', ownerId: 'u_caller' };
  const APPLICATION = {
    dateOfBirth: '1990-04-12',
    propertyAddress: '10 Main St',
    monthlyRent: 2400,
    monthlyGrossIncome: 7200,
    employerOrSource: 'Northside Credit Union',
    priorEvictions: false,
    electronicSignature: 'Pat Applicant',
  };
  const CONTACT = {
    id: 'c_own',
    name: 'Pat Applicant',
    email: 'pat@example.com',
    phone: '555-0100',
    spaceId: 'sp_own',
    applicationStatus: 'received',
    applicationData: APPLICATION,
    leadScore: 82,
    scoreLabel: 'hot',
    scoreSummary: 'Strong income',
    budget: 2400,
  };

  let contact: typeof CONTACT | null = CONTACT;
  let contacts: Array<Record<string, unknown>> = [];

  function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ['select', 'order', 'limit', 'is', 'gt', 'neq', 'not']) {
      chain[m] = vi.fn(self);
    }
    chain.eq = vi.fn((column: string, value: unknown) => {
      eqCalls.push({ table, column, value });
      return chain;
    });
    chain.in = vi.fn((column: string, values: unknown) => {
      inCalls.push({ table, column, values });
      return chain;
    });
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      inserts.push({ table, values });
      return chain;
    });
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return chain;
    });
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'Contact') return { data: contact, error: null };
      if (table === 'SpaceSetting') return { data: { businessName: 'Jane Realty' }, error: null };
      if (table === 'Space') return { data: { name: 'Jane Realty' }, error: null };
      return { data: null, error: null };
    });
    chain.single = vi.fn(async () => {
      if (table === 'Contact') {
        return contact
          ? { data: contact, error: null }
          : { data: null, error: { message: 'not found' } };
      }
      return { data: null, error: null };
    });
    (chain as { then: unknown }).then = (
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => {
      const data = table === 'Contact' ? contacts : null;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return chain;
  }

  return {
    requireContactAccess: vi.fn(),
    requireSpaceOwner: vi.fn(),
    eqCalls,
    inCalls,
    inserts,
    updates,
    CALLER,
    CONTACT,
    APPLICATION,
    makeChain,
    setContact: (row: typeof CONTACT | null) => {
      contact = row;
    },
    setContacts: (rows: Array<Record<string, unknown>>) => {
      contacts = rows;
    },
  };
});

vi.mock('@/lib/api-auth', () => ({
  requireContactAccess,
  requireSpaceOwner,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { PATCH as patchStatus } from '@/app/api/applications/status/route';
import { GET as getPdf } from '@/app/api/applications/pdf/route';
import { GET as compareApplicants } from '@/app/api/applications/compare/route';

const DENY = NextResponse.json({ error: 'Not found' }, { status: 404 });
const AUTH = { userId: 'u_caller', space: CALLER };

function jsonReq(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getReq(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  eqCalls.length = 0;
  inCalls.length = 0;
  inserts.length = 0;
  updates.length = 0;
  setContact(CONTACT);
  setContacts([]);
  requireContactAccess.mockResolvedValue(AUTH);
  requireSpaceOwner.mockResolvedValue(AUTH);
});

describe('PATCH /api/applications/status — validation + scoped write', () => {
  it('400s missing contactId or status before auth or Contact lookup', async () => {
    const missingId = await patchStatus(jsonReq('/api/applications/status', { status: 'approved' }));
    expect(missingId.status).toBe(400);

    const missingStatus = await patchStatus(
      jsonReq('/api/applications/status', { contactId: CONTACT.id }),
    );
    expect(missingStatus.status).toBe(400);

    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(eqCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('400s an unknown status before auth (needs_info is allowed)', async () => {
    const invalid = await patchStatus(
      jsonReq('/api/applications/status', { contactId: CONTACT.id, status: 'needs_more_docs' }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: 'Invalid status' });
    expect(requireContactAccess).not.toHaveBeenCalled();

    const needsInfo = await patchStatus(
      jsonReq('/api/applications/status', {
        contactId: CONTACT.id,
        status: 'needs_info',
        statusNote: '  bank statements  ',
      }),
    );
    expect(needsInfo.status).toBe(200);
    expect(requireContactAccess).toHaveBeenCalledWith(CONTACT.id);
    expect(updates.filter((u) => u.table === 'Contact')).toHaveLength(1);
    expect(updates[0]?.payload).toMatchObject({
      applicationStatus: 'needs_info',
      applicationStatusNote: 'bank statements',
    });
  });

  it('returns the deny response and does not update Contact or insert audit', async () => {
    requireContactAccess.mockResolvedValue(DENY);

    const res = await patchStatus(
      jsonReq('/api/applications/status', { contactId: 'c_victim', status: 'approved' }),
    );
    expect(res.status).toBe(404);
    expect(eqCalls).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('scopes the Contact write and ApplicationStatusUpdate to the caller space', async () => {
    const res = await patchStatus(
      jsonReq('/api/applications/status', {
        contactId: CONTACT.id,
        status: 'approved',
        statusNote: '  good fit  ',
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, status: 'approved' });

    expect(eqCalls.filter((c) => c.table === 'Contact' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'sp_own',
      'sp_own',
    ]);
    expect(eqCalls.filter((c) => c.table === 'Contact' && c.column === 'id').map((c) => c.value)).toEqual([
      CONTACT.id,
      CONTACT.id,
    ]);

    const contactWrite = updates.find((u) => u.table === 'Contact');
    expect(contactWrite?.payload).toMatchObject({
      applicationStatus: 'approved',
      applicationStatusNote: 'good fit',
    });
    expect(typeof (contactWrite?.payload as { updatedAt?: string }).updatedAt).toBe('string');

    expect(inserts).toEqual([
      {
        table: 'ApplicationStatusUpdate',
        values: {
          contactId: CONTACT.id,
          spaceId: 'sp_own',
          fromStatus: 'received',
          toStatus: 'approved',
          note: 'good fit',
        },
      },
    ]);
  });
});

describe('GET /api/applications/pdf — access + no PII leak', () => {
  it('400s a missing contactId before auth', async () => {
    const res = await getPdf(getReq('/api/applications/pdf'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'contactId required' });
    expect(requireContactAccess).not.toHaveBeenCalled();
    expect(eqCalls).toHaveLength(0);
  });

  it('returns the deny response and does not read Contact', async () => {
    requireContactAccess.mockResolvedValue(DENY);

    const res = await getPdf(getReq('/api/applications/pdf?contactId=c_victim'));
    expect(res.status).toBe(404);
    expect(eqCalls).toHaveLength(0);
  });

  it('404s when the scoped Contact row is missing', async () => {
    setContact(null);

    const res = await getPdf(getReq(`/api/applications/pdf?contactId=${CONTACT.id}`));
    expect(res.status).toBe(404);
    expect(eqCalls.filter((c) => c.table === 'Contact' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'sp_own',
    ]);
    expect(await res.text()).not.toContain('<html');
  });

  it('400s a contact with no applicationData and does not return HTML', async () => {
    setContact({ ...CONTACT, applicationData: null as unknown as typeof APPLICATION });

    const res = await getPdf(getReq(`/api/applications/pdf?contactId=${CONTACT.id}`));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'No application data' });
    expect(res.headers.get('content-type')).not.toMatch(/html/i);
  });

  it('returns HTML for the scoped contact and does not query another space', async () => {
    const res = await getPdf(getReq(`/api/applications/pdf?contactId=${CONTACT.id}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);

    const html = await res.text();
    expect(html).toContain('Pat Applicant');
    expect(html).toContain('10 Main St');
    expect(html).toContain('Northside Credit Union');
    expect(html).toContain('Jane Realty');
    expect(html).toContain(CONTACT.id);

    expect(eqCalls.filter((c) => c.table === 'Contact' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'sp_own',
    ]);
    expect(eqCalls.filter((c) => c.table === 'Contact' && c.column === 'id').map((c) => c.value)).toEqual([
      CONTACT.id,
    ]);
    expect(eqCalls.filter((c) => c.table === 'SpaceSetting' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'sp_own',
    ]);
  });
});

describe('GET /api/applications/compare — validation + tenant list', () => {
  it('400s missing slug or ids before auth', async () => {
    const noSlug = await compareApplicants(getReq('/api/applications/compare?ids=c1,c2'));
    expect(noSlug.status).toBe(400);

    const noIds = await compareApplicants(getReq('/api/applications/compare?slug=jane'));
    expect(noIds.status).toBe(400);

    expect(requireSpaceOwner).not.toHaveBeenCalled();
    expect(eqCalls).toHaveLength(0);
    expect(inCalls).toHaveLength(0);
  });

  it('400s a single id after auth and does not query Contact', async () => {
    const res = await compareApplicants(getReq('/api/applications/compare?slug=jane&ids=c_own'));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'At least 2 IDs required' });
    expect(requireSpaceOwner).toHaveBeenCalledWith('jane');
    expect(eqCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
    expect(inCalls).toHaveLength(0);
  });

  it('returns the deny response and does not query Contact', async () => {
    requireSpaceOwner.mockResolvedValue(DENY);

    const res = await compareApplicants(
      getReq('/api/applications/compare?slug=victim&ids=c1,c2'),
    );
    expect(res.status).toBe(404);
    expect(eqCalls.filter((c) => c.table === 'Contact')).toHaveLength(0);
    expect(inCalls).toHaveLength(0);
  });

  it('lists at most 10 ids scoped to the caller space', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c_${i}`);
    const listed = ids.slice(0, 10).map((id) => ({ id, name: id, spaceId: 'sp_own' }));
    setContacts(listed);

    const res = await compareApplicants(
      getReq(`/api/applications/compare?slug=jane&ids=${ids.join(',')}`),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(listed);

    expect(eqCalls.filter((c) => c.table === 'Contact' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'sp_own',
    ]);
    expect(inCalls).toEqual([{ table: 'Contact', column: 'id', values: ids.slice(0, 10) }]);
  });

  it('404s when the scoped list is empty', async () => {
    setContacts([]);

    const res = await compareApplicants(getReq('/api/applications/compare?slug=jane&ids=c1,c2'));
    expect(res.status).toBe(404);
    expect(eqCalls.filter((c) => c.table === 'Contact' && c.column === 'spaceId').map((c) => c.value)).toEqual([
      'sp_own',
    ]);
  });
});
