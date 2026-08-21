/**
 * Behavioral IDOR locks for no-workspace callers on high-risk PII routes.
 *
 * A signed-in user with no workspace must 404 (no Forbidden existence
 * oracle) and must not reach File / Note / ContactDocument / CustomAgent /
 * AgentDraft / AgentMemory / studio generation / post-tour propose.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: vi.fn() };
});

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireActiveSubscription: vi.fn(),
  requireSpaceOwner: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
  getSpaceFromSlug: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(async () => 'https://signed.example/file'),
  deleteObject: vi.fn(async () => undefined),
  getObjectText: vi.fn(async () => '# doc'),
  uploadObject: vi.fn(async () => undefined),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/delivery', () => ({ sendDraft: vi.fn(), describeDelivery: () => 'via email' }));
vi.mock('@/lib/inbox', () => ({ recordOutboundMessageSafe: vi.fn() }));
vi.mock('@/lib/messaging/compliance', () => ({
  checkSendAllowed: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/lead-scoring', () => ({
  scoreLeadApplicationDynamic: vi.fn(),
}));
vi.mock('@/lib/billing/meter', () => ({
  assertCanSpend: vi.fn(async () => undefined),
  chargeWorkflow: vi.fn(async () => undefined),
  CreditsExhaustedError: class CreditsExhaustedError extends Error {},
  SubscriptionDelinquentError: class SubscriptionDelinquentError extends Error {},
}));

const { runStudioGeneration, proposeActions } = vi.hoisted(() => ({
  runStudioGeneration: vi.fn(),
  proposeActions: vi.fn(),
}));
vi.mock('@/lib/studio/fal', () => ({ falConfigured: vi.fn(() => true) }));
vi.mock('@/lib/studio/generate', () => ({
  runStudioGeneration,
  StudioGenerationError: class StudioGenerationError extends Error {},
}));
vi.mock('@/lib/studio/spend', () => ({
  checkStudioSpendBudget: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/chippi/post-tour', async () => {
  const actual = await vi.importActual<typeof import('@/lib/chippi/post-tour')>('@/lib/chippi/post-tour');
  return {
    ...actual,
    proposeActions,
    attachHumanSummaries: vi.fn(async (proposals: unknown) => proposals),
    loadPostTourIntegrationTools: vi.fn(async () => []),
  };
});

vi.mock('@/lib/ai-tools/openai-client', () => ({
  getOpenAIClient: () => ({ client: {} }),
  MissingOpenAIKeyError: class MissingOpenAIKeyError extends Error {},
}));

vi.mock('@/lib/ai-tools/registry', () => ({
  listTools: () => [],
}));

const { fromMock, fromMockTables } = vi.hoisted(() => {
  const fromMockTables: string[] = [];
  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'upsert', 'not', 'is', 'neq', 'update', 'delete'];
    for (const m of passthrough) chain[m] = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: null }));
    chain.single = vi.fn(async () => ({ data: null }));
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null }).then(resolve);
    fromMockTables.push(table);
    return chain;
  });
  return { fromMock, fromMockTables };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import { GET as getFile, DELETE as deleteFile } from '@/app/api/files/[id]/route';
import { GET as getDocument, DELETE as deleteDocument } from '@/app/api/documents/[id]/route';
import { GET as getNote, PATCH as patchNote, DELETE as deleteNote } from '@/app/api/notes/[id]/route';
import { GET as getCustomAgent } from '@/app/api/custom-agents/[id]/route';
import { DELETE as deleteMemory } from '@/app/api/agent/memory/[id]/route';
import { PATCH as patchDraft } from '@/app/api/agent/drafts/[id]/route';
import { POST as postTour } from '@/app/api/chippi/post-tour/route';
import { POST as studioGenerate } from '@/app/api/studio/generate/route';
import { GET as getEditorDoc } from '@/app/api/files/documents/[id]/route';
import { GET as getAgentContact } from '@/app/api/agent/contact/[id]/route';
import { GET as getAgentDeal } from '@/app/api/agent/deal/[id]/route';
import { GET as getTimeline } from '@/app/api/contacts/[id]/timeline/route';
import { POST as emailContact } from '@/app/api/contacts/[id]/email/route';
import { POST as rescoreContact } from '@/app/api/contacts/[id]/rescore/route';
import { DELETE as deleteOverride } from '@/app/api/tours/overrides/[id]/route';
import { PATCH as patchGoal } from '@/app/api/agent/goals/[id]/route';
import { PATCH as patchQuestion } from '@/app/api/agent/questions/[id]/route';
import { GET as getBrief } from '@/app/api/agent/brief/[contactId]/route';
import { GET as getContactContext } from '@/app/api/agent/contact-context/[contactId]/route';
import { POST as reverseActivity } from '@/app/api/agent/activity/[id]/reverse/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function contactParams(contactId: string) {
  return { params: Promise.resolve({ contactId }) };
}

function noPii(body: string) {
  expect(body).not.toContain('VICTIM');
  expect(body).not.toContain('555-0100');
  expect(body).not.toContain('$500,000');
  expect(body).not.toContain('secret.pdf');
  expect(body).not.toContain('signer@victim.com');
  expect(body).not.toContain('123 Victim Lane');
  expect(body).not.toContain('Forbidden');
}

beforeEach(() => {
  vi.clearAllMocks();
  fromMockTables.length = 0;
  runStudioGeneration.mockReset();
  proposeActions.mockReset();
  mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
  mockGetSpaceForUser.mockResolvedValue(null);
});

describe('no workspace — high-risk PII routes 404 without an existence oracle', () => {
  it('GET /api/files/[id] 404s and does not query File', async () => {
    const res = await getFile(new NextRequest('http://localhost/api/files/file_victim'), params('file_victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
  });

  it('DELETE /api/files/[id] 404s and does not query File', async () => {
    const res = await deleteFile(
      new NextRequest('http://localhost/api/files/file_victim', { method: 'DELETE' }),
      params('file_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
  });

  it('GET /api/documents/[id] 404s and does not query ContactDocument', async () => {
    const res = await getDocument(
      new NextRequest('http://localhost/api/documents/doc_victim'),
      params('doc_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ContactDocument');
  });

  it('DELETE /api/documents/[id] 404s and does not query ContactDocument', async () => {
    const res = await deleteDocument(
      new NextRequest('http://localhost/api/documents/doc_victim', { method: 'DELETE' }),
      params('doc_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ContactDocument');
  });

  it('GET /api/notes/[id] 404s and does not query Note', async () => {
    const res = await getNote(new NextRequest('http://localhost/api/notes/note_victim'), params('note_victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Note');
  });

  it('PATCH /api/notes/[id] 404s and does not query Note', async () => {
    const res = await patchNote(
      new NextRequest('http://localhost/api/notes/note_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'VICTIM' }),
      }),
      params('note_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Note');
  });

  it('DELETE /api/notes/[id] 404s and does not query Note', async () => {
    const res = await deleteNote(
      new NextRequest('http://localhost/api/notes/note_victim', { method: 'DELETE' }),
      params('note_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Note');
  });

  it('GET /api/custom-agents/[id] 404s and does not query CustomAgent', async () => {
    const res = await getCustomAgent(
      new NextRequest('http://localhost/api/custom-agents/agent_victim'),
      params('agent_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('CustomAgent');
  });

  it('DELETE /api/agent/memory/[id] 404s and does not query AgentMemory', async () => {
    const res = await deleteMemory(
      new NextRequest('http://localhost/api/agent/memory/mem_victim', { method: 'DELETE' }),
      params('mem_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentMemory');
  });

  it('PATCH /api/agent/drafts/[id] 404s and does not query AgentDraft', async () => {
    const res = await patchDraft(
      new NextRequest('http://localhost/api/agent/drafts/draft_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }),
      params('draft_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentDraft');
  });

  it('POST /api/chippi/post-tour 404s and does not propose against victim context', async () => {
    const res = await postTour(
      new NextRequest('http://localhost/api/chippi/post-tour', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: 'VICTIM tour at 123 Victim Lane, $500,000, call 555-0100',
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(proposeActions).not.toHaveBeenCalled();
  });

  it('POST /api/studio/generate 404s and does not start generation', async () => {
    const res = await studioGenerate(
      new NextRequest('http://localhost/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'VICTIM listing at 123 Victim Lane' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(runStudioGeneration).not.toHaveBeenCalled();
  });

  it('GET /api/files/documents/[id] 404s and does not query File', async () => {
    const res = await getEditorDoc(
      new NextRequest('http://localhost/api/files/documents/doc_victim'),
      params('doc_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
  });

  it('GET /api/agent/contact/[id] 404s and does not query Contact', async () => {
    const res = await getAgentContact(
      new NextRequest('http://localhost/api/agent/contact/c_victim'),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('AgentMemory');
  });

  it('GET /api/agent/deal/[id] 404s and does not query Deal', async () => {
    const res = await getAgentDeal(
      new NextRequest('http://localhost/api/agent/deal/d_victim'),
      params('d_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('AgentMemory');
  });

  it('GET /api/contacts/[id]/timeline 404s and does not query Contact', async () => {
    const res = await getTimeline(
      new NextRequest('http://localhost/api/contacts/c_victim/timeline'),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('Tour');
  });

  it('POST /api/contacts/[id]/email 404s and does not query Contact', async () => {
    const res = await emailContact(
      new NextRequest('http://localhost/api/contacts/c_victim/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: 'VICTIM', body: '555-0100 at 123 Victim Lane' }),
      }),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
  });

  it('POST /api/contacts/[id]/rescore 404s and does not query Contact', async () => {
    const res = await rescoreContact(
      new NextRequest('http://localhost/api/contacts/c_victim/rescore', { method: 'POST' }),
      params('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
  });

  it('DELETE /api/tours/overrides/[id] 404s and does not query overrides', async () => {
    const res = await deleteOverride(
      new NextRequest('http://localhost/api/tours/overrides/ov_victim', { method: 'DELETE' }),
      params('ov_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('TourAvailabilityOverride');
  });

  it('PATCH /api/agent/goals/[id] 404s and does not query AgentGoal', async () => {
    const res = await patchGoal(
      new NextRequest('http://localhost/api/agent/goals/goal_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }),
      params('goal_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentGoal');
  });

  it('PATCH /api/agent/questions/[id] 404s and does not query AgentQuestion', async () => {
    const res = await patchQuestion(
      new NextRequest('http://localhost/api/agent/questions/q_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: 'VICTIM answer' }),
      }),
      params('q_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentQuestion');
  });

  it('GET /api/agent/brief/[contactId] 404s and does not query Contact', async () => {
    const res = await getBrief(
      new NextRequest('http://localhost/api/agent/brief/c_victim'),
      contactParams('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('AgentMemory');
  });

  it('GET /api/agent/contact-context/[contactId] 404s and does not query Contact', async () => {
    const res = await getContactContext(
      new NextRequest('http://localhost/api/agent/contact-context/c_victim'),
      contactParams('c_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('AgentGoal');
  });

  it('POST /api/agent/activity/[id]/reverse 404s and does not query activity', async () => {
    const res = await reverseActivity(
      new NextRequest('http://localhost/api/agent/activity/act_victim/reverse', { method: 'POST' }),
      params('act_victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentActivityLog');
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('Deal');
  });
});
