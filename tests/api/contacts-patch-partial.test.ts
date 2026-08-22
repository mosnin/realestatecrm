/**
 * PATCH /api/contacts/:id is a field allow-list. A tags-only body must not
 * null out email/phone/notes/properties — convert-to-client and inline
 * editors depend on that.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn() }));
vi.mock('@/lib/audit', () => ({ audit: vi.fn(async () => undefined) }));
vi.mock('@/lib/vectorize', () => ({
  syncContact: vi.fn(async () => undefined),
  deleteContactVector: vi.fn(async () => undefined),
}));
vi.mock('@/lib/storage', () => ({ deleteObjectsBestEffort: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/workflows/executor', () => ({ runWorkflowsForEvent: vi.fn() }));

const existing = {
  id: 'c1',
  spaceId: 'space_1',
  name: 'Jane Chen',
  email: 'jane@example.com',
  phone: '555-0100',
  notes: 'Keep me',
  properties: ['12 Oak'],
  tags: ['application-link', 'hot'],
  type: 'QUALIFICATION',
};

let updatePayload: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    let isUpdate = false;
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.update = vi.fn((values: Record<string, unknown>) => {
      isUpdate = true;
      updatePayload = values;
      return chain;
    });
    chain.single = vi.fn(() =>
      Promise.resolve({
        data: isUpdate ? { ...existing, ...updatePayload } : existing,
        error: null,
      }),
    );
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [existing], error: null }).then(resolve);
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

import { PATCH } from '@/app/api/contacts/[id]/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { convertLeadTagPatch } from '@/lib/contact-form-state';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const SPACE = { id: 'space_1', name: 'Acme' } as never;
const params = Promise.resolve({ id: 'c1' });

function patchReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/contacts/c1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updatePayload = null;
  mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
  mockGetSpaceForUser.mockResolvedValue(SPACE);
});

describe('PATCH /api/contacts/:id — partial update', () => {
  it('a convert-to-client tags patch does not write email/phone/notes/properties', async () => {
    const res = await PATCH(patchReq(convertLeadTagPatch(existing.tags)), { params });
    expect(res.status).toBe(200);
    expect(updatePayload).not.toBeNull();
    expect(updatePayload).toMatchObject({ tags: ['hot'] });
    expect(updatePayload).not.toHaveProperty('email');
    expect(updatePayload).not.toHaveProperty('phone');
    expect(updatePayload).not.toHaveProperty('notes');
    expect(updatePayload).not.toHaveProperty('properties');
    expect(updatePayload).not.toHaveProperty('name');
  });

  it('omitted fields stay off the update object', async () => {
    const res = await PATCH(patchReq({ followUpAt: null }), { params });
    expect(res.status).toBe(200);
    expect(updatePayload).toMatchObject({ followUpAt: null });
    expect(updatePayload).not.toHaveProperty('email');
    expect(updatePayload).not.toHaveProperty('tags');
  });
});
