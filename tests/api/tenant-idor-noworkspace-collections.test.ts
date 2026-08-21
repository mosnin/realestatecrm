/**
 * Behavioral IDOR locks for no-workspace callers on leftover PII collection
 * routes. A signed-in user with no workspace must 404 (no Forbidden
 * existence oracle) and must not query tenant tables.
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
  uploadObject: vi.fn(async () => undefined),
  buildKey: vi.fn(() => 'files/x'),
  getPublicUrl: vi.fn(() => 'https://cdn.example/x'),
}));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/data-export', () => ({ exportSpaceData: vi.fn(async () => ({})) }));
vi.mock('@/lib/briefing/compose', () => ({ composeBrief: vi.fn() }));
vi.mock('@/lib/activity/query', () => ({ getUnifiedActivity: vi.fn() }));

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

import { GET as getGoals, POST as postGoals } from '@/app/api/agent/goals/route';
import { GET as getQuestions, POST as postQuestions } from '@/app/api/agent/questions/route';
import { GET as getBriefing, PATCH as patchBriefing } from '@/app/api/agent/briefing/route';
import { GET as listFiles, POST as postFiles } from '@/app/api/files/route';
import { GET as listDocuments, POST as postDocuments } from '@/app/api/files/documents/route';
import { POST as upload } from '@/app/api/upload/route';
import { GET as exportAccount } from '@/app/api/account/export/route';
import { GET as getToday } from '@/app/api/agent/today/route';
import { GET as listDrafts } from '@/app/api/agent/drafts/route';
import { GET as getActivity } from '@/app/api/chippi/activity/route';
import { GET as firstTouch } from '@/app/api/leads/first-touch/route';
import { POST as postAttachment, DELETE as deleteAttachment } from '@/app/api/ai/attachments/route';
import { GET as getAttachment } from '@/app/api/ai/attachments/[id]/route';
import { POST as coverPhoto, DELETE as deleteCoverPhoto } from '@/app/api/profile-page/cover-photo/route';
import { POST as profilePhoto, DELETE as deleteProfilePhoto } from '@/app/api/profile-page/profile-photo/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

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
  mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
  mockGetSpaceForUser.mockResolvedValue(null);
});

describe('no workspace — leftover PII collections 404 without an existence oracle', () => {
  it('GET /api/agent/goals 404s and does not query AgentGoal', async () => {
    const res = await getGoals(new NextRequest('http://localhost/api/agent/goals'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentGoal');
  });

  it('POST /api/agent/goals 404s and does not insert AgentGoal', async () => {
    const res = await postGoals(
      new NextRequest('http://localhost/api/agent/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalType: 'custom', description: 'Chase VICTIM' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentGoal');
  });

  it('GET /api/agent/questions 404s and does not query AgentQuestion', async () => {
    const res = await getQuestions(new NextRequest('http://localhost/api/agent/questions'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentQuestion');
  });

  it('POST /api/agent/questions 404s and does not insert AgentQuestion', async () => {
    const res = await postQuestions(
      new NextRequest('http://localhost/api/agent/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'Should I call VICTIM at 555-0100?' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentQuestion');
  });

  it('GET /api/agent/briefing 404s and does not query Brief', async () => {
    const res = await getBriefing(new NextRequest('http://localhost/api/agent/briefing'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Brief');
    expect(fromMockTables).not.toContain('SpaceSetting');
  });

  it('PATCH /api/agent/briefing 404s and does not query Brief', async () => {
    const res = await patchBriefing(
      new NextRequest('http://localhost/api/agent/briefing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'seen' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Brief');
  });

  it('GET /api/files 404s and does not query File', async () => {
    const res = await listFiles(new NextRequest('http://localhost/api/files'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
    expect(fromMockTables).not.toContain('Attachment');
  });

  it('POST /api/files 404s and does not insert File', async () => {
    const res = await postFiles(new NextRequest('http://localhost/api/files', { method: 'POST' }));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
  });

  it('GET /api/files/documents 404s and does not query File', async () => {
    const res = await listDocuments();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
  });

  it('POST /api/files/documents 404s and does not insert File', async () => {
    const res = await postDocuments(
      new NextRequest('http://localhost/api/files/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'secret.pdf', content: 'VICTIM' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
  });

  it('POST /api/upload 404s and does not query File', async () => {
    const res = await upload(new NextRequest('http://localhost/api/upload', { method: 'POST' }));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('File');
  });

  it('GET /api/account/export 404s and does not export tenant tables', async () => {
    const res = await exportAccount(new NextRequest('http://localhost/api/account/export'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('Deal');
  });

  it('GET /api/agent/today 404s and does not query Contact or Tour', async () => {
    const res = await getToday(new NextRequest('http://localhost/api/agent/today'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('Tour');
  });

  it('GET /api/agent/drafts 404s and does not query AgentDraft', async () => {
    const res = await listDrafts(new NextRequest('http://localhost/api/agent/drafts'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentDraft');
  });

  it('GET /api/chippi/activity 404s and does not query activity', async () => {
    const res = await getActivity(new NextRequest('http://localhost/api/chippi/activity'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentActivityLog');
    expect(fromMockTables).not.toContain('ContactActivity');
  });

  it('GET /api/leads/first-touch 404s and does not query AgentDraft', async () => {
    const res = await firstTouch(new NextRequest('http://localhost/api/leads/first-touch'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentDraft');
  });

  it('POST /api/ai/attachments 404s and does not insert Attachment', async () => {
    const res = await postAttachment(new NextRequest('http://localhost/api/ai/attachments', { method: 'POST' }));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Attachment');
  });

  it('DELETE /api/ai/attachments 404s and does not query Attachment', async () => {
    const res = await deleteAttachment(
      new NextRequest('http://localhost/api/ai/attachments?id=att_victim', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Attachment');
  });

  it('GET /api/ai/attachments/[id] 404s and does not query Attachment', async () => {
    const res = await getAttachment(
      new NextRequest('http://localhost/api/ai/attachments/att_victim'),
      { params: Promise.resolve({ id: 'att_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Attachment');
  });

  it('POST /api/profile-page/cover-photo 404s and does not query ProfilePage', async () => {
    const res = await coverPhoto(new NextRequest('http://localhost/api/profile-page/cover-photo', { method: 'POST' }));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ProfilePage');
  });

  it('DELETE /api/profile-page/cover-photo 404s and does not query ProfilePage', async () => {
    const res = await deleteCoverPhoto(
      new NextRequest('http://localhost/api/profile-page/cover-photo', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ProfilePage');
  });

  it('POST /api/profile-page/profile-photo 404s and does not query ProfilePage', async () => {
    const res = await profilePhoto(
      new NextRequest('http://localhost/api/profile-page/profile-photo', { method: 'POST' }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ProfilePage');
  });

  it('DELETE /api/profile-page/profile-photo 404s and does not query ProfilePage', async () => {
    const res = await deleteProfilePhoto(
      new NextRequest('http://localhost/api/profile-page/profile-photo', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ProfilePage');
  });
});
