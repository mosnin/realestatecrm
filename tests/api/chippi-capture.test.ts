/**
 * POST /api/chippi/capture — Chippi turns free text into structured contact
 * fields. These tests pin the SAFETY-critical behaviour: the route only ever
 * returns clamped/validated structure (never an unbounded or invalid value),
 * never invents a name, and never calls the model when there's nothing to read.
 * The route itself imports no DB client, so it cannot write — the contract is
 * "read a sentence, return structure".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@/lib/llm', () => ({
  getLLMClient: () => ({ chat: { completions: { create: createMock } } }),
  resolveChatModel: () => 'test-model',
}));

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(async () => ({ space: { id: 'space-1' }, userId: 'u1' })),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chippi/capture/route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/chippi/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockModel(obj: unknown) {
  createMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }] });
}

describe('POST /api/chippi/capture', () => {
  beforeEach(() => createMock.mockReset());

  it('falls back the name and nulls an invalid (negative) budget', async () => {
    mockModel({ name: '', email: null, phone: null, budget: -50, preferences: null, address: null, notes: null, tags: [] });
    const res = await POST(req({ slug: 's', text: 'a buyer I met' }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.fields.name).toBe('New contact');
    expect(data.fields.budget).toBeNull();
  });

  it('lowercases + caps tags at 5 and rounds the budget', async () => {
    mockModel({
      name: 'Sarah Kim',
      email: 'sarah@example.com',
      phone: '555-0142',
      budget: 600000.7,
      preferences: '3BR with a yard',
      address: null,
      notes: 'met at Oak St open house',
      tags: ['Buyer', 'PRE-APPROVED', 'a', 'b', 'c', 'd', 'e'],
    });
    const res = await POST(req({ slug: 's', text: 'x' }));
    const data = await res.json();
    expect(data.fields.name).toBe('Sarah Kim');
    expect(data.fields.budget).toBe(600001);
    expect(data.fields.tags).toEqual(['buyer', 'pre-approved', 'a', 'b', 'c']);
    expect(data.fields.preferences).toBe('3BR with a yard');
  });

  it('rejects empty text without ever calling the model', async () => {
    const res = await POST(req({ slug: 's', text: '   ' }));
    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('returns 502 (never bogus fields) when the model emits non-JSON', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'sorry, I cannot' } }] });
    const res = await POST(req({ slug: 's', text: 'someone' }));
    expect(res.status).toBe(502);
  });
});
