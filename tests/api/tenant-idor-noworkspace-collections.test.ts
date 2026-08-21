/**
 * Behavioral IDOR locks for no-workspace callers on leftover PII collection
 * routes. A signed-in user with no workspace must 404 (no Forbidden
 * existence oracle) and must not query tenant tables.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
vi.mock('@/lib/voice', () => ({
  placeClickToCall: vi.fn(),
  toE164: vi.fn((n: string) => n),
  getVoiceConfig: vi.fn(() => null),
  isVoiceConfigured: vi.fn(() => false),
}));
vi.mock('@/lib/vectorize', () => ({ syncContact: vi.fn() }));
vi.mock('@/lib/permissions', () => ({
  getBrokerContext: vi.fn(),
  canManageLeads: vi.fn(() => false),
}));
vi.mock('@/lib/broker-assign-lead', () => ({ assignLeadToRealtor: vi.fn() }));
vi.mock('@/lib/data-export', () => ({ exportSpaceData: vi.fn(async () => ({})) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));
vi.mock('@/lib/integrations/connections', () => ({ activeToolkits: vi.fn(async () => []) }));
vi.mock('@/lib/integrations/catalog', () => ({ findIntegration: vi.fn() }));
vi.mock('@/lib/storage/limits', () => ({ validateUpload: vi.fn(() => ({ ok: true })) }));
vi.mock('@/lib/briefing/compose', () => ({ composeBrief: vi.fn() }));
vi.mock('@/lib/briefing/delivery', () => ({
  deliverBrief: vi.fn(),
  loadDeliveryContext: vi.fn(),
  getAppOrigin: vi.fn(() => 'https://app.example'),
}));
vi.mock('@/lib/activity/query', () => ({ getUnifiedActivity: vi.fn() }));
vi.mock('@/lib/realtime/ably', () => ({
  createSpaceTokenRequest: vi.fn(async () => null),
  publishSpaceEvent: vi.fn(),
}));
vi.mock('@/lib/usage/today-token-usage', () => ({
  getTodayTokenUsage: vi.fn(async () => ({ total: 0 })),
}));
vi.mock('@/lib/agent/quick-draft', () => ({ composeQuickDraft: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'u_caller' })),
}));
vi.mock('@/lib/redis', () => ({
  redis: {
    zremrangebyscore: vi.fn(),
    zrange: vi.fn(),
    lrange: vi.fn(),
  },
}));
vi.mock('@/lib/agent/task-state-machine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agent/task-state-machine')>(
    '@/lib/agent/task-state-machine',
  );
  return { ...actual, transitionTask: vi.fn() };
});
vi.mock('@/lib/routines', () => ({
  fireRoutineRun: vi.fn(),
  ROUTINE_CADENCES: ['daily', 'weekly', 'monthly', 'custom'],
  ROUTINE_WEEKDAYS: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  ROUTINE_MAX_DAY_OF_MONTH: 28,
}));

const { fromMock, fromMockTables } = vi.hoisted(() => {
  const fromMockTables: string[] = [];
  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'upsert', 'not', 'is', 'neq', 'update', 'delete', 'gte', 'like'];
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
import { GET as getStudioLibrary } from '@/app/api/studio/library/route';
import { GET as getRecentJob } from '@/app/api/studio/recent-job/route';
import { GET as getStudioSchedule, DELETE as deleteStudioSchedule } from '@/app/api/studio/schedule/route';
import { POST as postBriefingTest } from '@/app/api/agent/briefing/test/route';
import { GET as getSwarm } from '@/app/api/swarm/[runId]/route';
import { GET as getSwarmStream } from '@/app/api/swarm/[runId]/stream/route';
import { POST as cancelSwarm } from '@/app/api/swarm/[runId]/cancel/route';
import { GET as getSettings, PATCH as patchSettings } from '@/app/api/agent/settings/route';
import { GET as getUsage } from '@/app/api/agent/usage/route';
import { GET as getPortfolio } from '@/app/api/agent/portfolio/route';
import { POST as postDirective } from '@/app/api/agent/directive/route';
import { GET as getAgentActivity } from '@/app/api/agent/activity/route';
import { GET as getRuns } from '@/app/api/agent/runs/route';
import { GET as getPriority } from '@/app/api/agent/priority/route';
import { GET as listRoutines, POST as postRoutine } from '@/app/api/routines/route';
import { POST as postDraftFeedback } from '@/app/api/agent/drafts/feedback/route';
import { GET as getAblyToken } from '@/app/api/ably/token/route';
import { POST as postRunNow } from '@/app/api/agent/run-now/route';
import { POST as postQuickDraft } from '@/app/api/agent/quick-draft/route';
import { PATCH as patchRoutineById, DELETE as deleteRoutineById, POST as runRoutineById } from '@/app/api/routines/[id]/route';
import { PATCH as patchPipelineById, DELETE as deletePipelineById } from '@/app/api/pipelines/[id]/route';
import { PATCH as reorderDeals } from '@/app/api/deals/reorder/route';
import { PATCH as patchStageById, DELETE as deleteStageById } from '@/app/api/stages/[id]/route';
import { PATCH as reorderStages } from '@/app/api/stages/reorder/route';
import { GET as getAgentTask, DELETE as deleteAgentTask } from '@/app/api/agent/tasks/[taskId]/route';
import { PATCH as patchTaskStatus, POST as postTaskStatus } from '@/app/api/agent/tasks/[taskId]/status/route';
import { GET as getActiveRuns } from '@/app/api/agent/active-runs/route';
import { GET as getAgentStream } from '@/app/api/agent/stream/route';
import { GET as getDealActivity, POST as postDealActivity } from '@/app/api/deals/[id]/activity/route';
import { GET as getCommissionSplits, POST as postCommissionSplits } from '@/app/api/deals/[id]/commission-splits/route';
import { POST as shiftChecklist } from '@/app/api/deals/[id]/checklist/shift/route';
import { GET as listNotes, POST as postNote } from '@/app/api/notes/route';
import { GET as listMessageTemplates, POST as postMessageTemplate } from '@/app/api/message-templates/route';
import { GET as listCalls, POST as postCall } from '@/app/api/calls/route';
import { GET as listSavedViews, POST as postSavedView } from '@/app/api/saved-views/route';
import { GET as searchWorkspace } from '@/app/api/search/route';
import { POST as postPushSubscribe, DELETE as deletePushSubscribe } from '@/app/api/push/subscribe/route';
import { GET as listTours, POST as postTour } from '@/app/api/tours/route';
import { GET as listDuplicates } from '@/app/api/contacts/duplicates/route';
import { POST as postContactsBulk } from '@/app/api/contacts/bulk/route';
import { requireAuth, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);

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
  mockRequireSpaceOwner.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }));
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
    const res = await firstTouch();
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
    const res = await deleteCoverPhoto();
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
    const res = await deleteProfilePhoto();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ProfilePage');
  });

  it('GET /api/studio/library 404s and does not query StudioGeneration', async () => {
    const res = await getStudioLibrary(new NextRequest('http://localhost/api/studio/library'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('StudioGeneration');
    expect(fromMockTables).not.toContain('File');
  });

  it('GET /api/studio/recent-job 404s and does not query StudioGeneration', async () => {
    const res = await getRecentJob(new NextRequest('http://localhost/api/studio/recent-job'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('StudioGeneration');
    expect(fromMockTables).not.toContain('File');
  });

  it('GET /api/studio/schedule 404s and does not query StudioPost', async () => {
    const res = await getStudioSchedule();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('StudioPost');
  });

  it('DELETE /api/studio/schedule 404s and does not query StudioPost', async () => {
    const res = await deleteStudioSchedule(
      new NextRequest('http://localhost/api/studio/schedule?id=post_victim', { method: 'DELETE' }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('StudioPost');
  });

  it('POST /api/agent/briefing/test 404s and does not query Brief', async () => {
    const res = await postBriefingTest();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Brief');
    expect(fromMockTables).not.toContain('SpaceSetting');
  });

  it('GET /api/swarm/[runId] 404s and does not query SwarmRun', async () => {
    const res = await getSwarm(
      new NextRequest('http://localhost/api/swarm/swarm_victim'),
      { params: Promise.resolve({ runId: 'swarm_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('SwarmRun');
    expect(fromMockTables).not.toContain('SwarmMember');
  });

  it('GET /api/swarm/[runId]/stream 404s and does not query SwarmRun', async () => {
    const res = await getSwarmStream(
      new NextRequest('http://localhost/api/swarm/swarm_victim/stream'),
      { params: Promise.resolve({ runId: 'swarm_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('SwarmRun');
    expect(fromMockTables).not.toContain('SwarmEvent');
  });

  it('POST /api/swarm/[runId]/cancel 404s and does not cancel a run', async () => {
    const res = await cancelSwarm(
      new NextRequest('http://localhost/api/swarm/swarm_victim/cancel', { method: 'POST' }),
      { params: Promise.resolve({ runId: 'swarm_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('SwarmRun');
  });

  it('GET /api/agent/settings 404s and does not query AgentSettings', async () => {
    const res = await getSettings(new NextRequest('http://localhost/api/agent/settings'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentSettings');
  });

  it('PATCH /api/agent/settings 404s and does not upsert AgentSettings', async () => {
    const res = await patchSettings(
      new NextRequest('http://localhost/api/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentSettings');
  });

  it('GET /api/agent/usage 404s and does not query ChatUsage', async () => {
    const res = await getUsage();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('ChatUsage');
    expect(fromMockTables).not.toContain('AgentSettings');
  });

  it('GET /api/agent/portfolio 404s and does not query Contact or Deal', async () => {
    const res = await getPortfolio();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('Deal');
  });

  it('POST /api/agent/directive 404s and does not write AgentMemory', async () => {
    const res = await postDirective(
      new NextRequest('http://localhost/api/agent/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive: 'Chase VICTIM at 555-0100' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentMemory');
  });

  it('GET /api/agent/activity 404s and does not query AgentActivityLog', async () => {
    const res = await getAgentActivity(new NextRequest('http://localhost/api/agent/activity'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentActivityLog');
  });

  it('GET /api/agent/runs 404s and does not query AgentActivityLog', async () => {
    const res = await getRuns();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentActivityLog');
  });

  it('GET /api/agent/priority 404s and does not query AgentMemory', async () => {
    const res = await getPriority(new NextRequest('http://localhost/api/agent/priority'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentMemory');
  });

  it('GET /api/routines 404s and does not query Routine', async () => {
    const res = await listRoutines();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Routine');
  });

  it('POST /api/routines 404s and does not insert Routine', async () => {
    const res = await postRoutine(
      new NextRequest('http://localhost/api/routines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: 'Follow up with VICTIM every morning' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Routine');
  });

  it('POST /api/agent/drafts/feedback 404s and does not query AgentDraft', async () => {
    const res = await postDraftFeedback(
      new NextRequest('http://localhost/api/agent/drafts/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: 'draft_victim', action: 'held' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentDraft');
  });

  it('GET /api/ably/token 404s and does not mint a space token', async () => {
    const res = await getAblyToken();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
  });

  it('POST /api/agent/run-now 404s and does not start a run', async () => {
    const res = await postRunNow();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
  });

  it('POST /api/agent/quick-draft 404s and does not query Contact or Deal', async () => {
    const res = await postQuickDraft(
      new NextRequest('http://localhost/api/agent/quick-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'person', id: 'c_victim' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('AgentDraft');
  });

  it('PATCH /api/routines/[id] 404s and does not write Routine', async () => {
    const res = await patchRoutineById(
      new NextRequest('http://localhost/api/routines/rtn_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }),
      { params: Promise.resolve({ id: 'rtn_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Routine');
  });

  it('DELETE /api/routines/[id] 404s and does not delete Routine', async () => {
    const res = await deleteRoutineById(
      new NextRequest('http://localhost/api/routines/rtn_victim', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'rtn_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Routine');
  });

  it('POST /api/routines/[id] 404s and does not run a routine', async () => {
    const res = await runRoutineById(
      new NextRequest('http://localhost/api/routines/rtn_victim', { method: 'POST' }),
      { params: Promise.resolve({ id: 'rtn_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Routine');
  });

  it('PATCH /api/pipelines/[id] 404s and does not write Pipeline', async () => {
    const res = await patchPipelineById(
      new NextRequest('http://localhost/api/pipelines/pipe_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      { params: Promise.resolve({ id: 'pipe_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Pipeline');
  });

  it('DELETE /api/pipelines/[id] 404s and does not delete Pipeline', async () => {
    const res = await deletePipelineById(
      new NextRequest('http://localhost/api/pipelines/pipe_victim', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'pipe_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Pipeline');
    expect(fromMockTables).not.toContain('DealStage');
  });

  it('PATCH /api/deals/reorder 404s and does not query Deal', async () => {
    const res = await reorderDeals(
      new NextRequest('http://localhost/api/deals/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: 'deal_victim', newStageId: 'stage_victim', newPosition: 0 }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('DealStage');
  });

  it('PATCH /api/stages/[id] 404s and does not write DealStage', async () => {
    const res = await patchStageById(
      new NextRequest('http://localhost/api/stages/stage_victim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      { params: Promise.resolve({ id: 'stage_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('DealStage');
  });

  it('DELETE /api/stages/[id] 404s and does not delete DealStage', async () => {
    const res = await deleteStageById(
      new NextRequest('http://localhost/api/stages/stage_victim', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'stage_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('DealStage');
    expect(fromMockTables).not.toContain('Deal');
  });

  it('PATCH /api/stages/reorder 404s and does not write DealStage', async () => {
    const res = await reorderStages(
      new NextRequest('http://localhost/api/stages/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageIds: ['stage_victim'] }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('DealStage');
  });

  it('GET /api/agent/tasks/[taskId] 404s and does not query AgentTask', async () => {
    const res = await getAgentTask(
      new NextRequest('http://localhost/api/agent/tasks/task_victim'),
      { params: Promise.resolve({ taskId: 'task_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentTask');
    expect(fromMockTables).not.toContain('ExecutionStep');
  });

  it('DELETE /api/agent/tasks/[taskId] 404s and does not cancel a task', async () => {
    const res = await deleteAgentTask(
      new NextRequest('http://localhost/api/agent/tasks/task_victim', { method: 'DELETE' }),
      { params: Promise.resolve({ taskId: 'task_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentTask');
  });

  it('PATCH /api/agent/tasks/[taskId]/status 404s and does not query AgentTask', async () => {
    const res = await patchTaskStatus(
      new NextRequest('http://localhost/api/agent/tasks/task_victim/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      }),
      { params: Promise.resolve({ taskId: 'task_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentTask');
    expect(fromMockTables).not.toContain('AgentActivityLog');
  });

  it('POST /api/agent/tasks/[taskId]/status 404s and does not query AgentTask', async () => {
    const res = await postTaskStatus(
      new NextRequest('http://localhost/api/agent/tasks/task_victim/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' }),
      }),
      { params: Promise.resolve({ taskId: 'task_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('AgentTask');
  });

  it('GET /api/agent/active-runs 404s and does not mint a run list', async () => {
    const res = await getActiveRuns();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
  });

  it('GET /api/agent/stream 404s and does not open a tenant stream', async () => {
    const res = await getAgentStream(
      new NextRequest('http://localhost/api/agent/stream?runId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    );
    expect(res.status).toBe(404);
    noPii(await res.text());
  });

  it('GET /api/deals/[id]/activity 404s and does not query DealActivity', async () => {
    const res = await getDealActivity(
      new NextRequest('http://localhost/api/deals/deal_victim/activity'),
      { params: Promise.resolve({ id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('DealActivity');
  });

  it('POST /api/deals/[id]/activity 404s and does not insert DealActivity', async () => {
    const res = await postDealActivity(
      new NextRequest('http://localhost/api/deals/deal_victim/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', content: 'Call VICTIM at 555-0100' }),
      }),
      { params: Promise.resolve({ id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('DealActivity');
  });

  it('GET /api/deals/[id]/commission-splits 404s and does not query CommissionSplit', async () => {
    const res = await getCommissionSplits(
      new NextRequest('http://localhost/api/deals/deal_victim/commission-splits'),
      { params: Promise.resolve({ id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('CommissionSplit');
  });

  it('POST /api/deals/[id]/commission-splits 404s and does not insert CommissionSplit', async () => {
    const res = await postCommissionSplits(
      new NextRequest('http://localhost/api/deals/deal_victim/commission-splits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ party: 'agent', label: 'VICTIM split', basis: 'percent', percentOfGci: 50 }),
      }),
      { params: Promise.resolve({ id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('CommissionSplit');
  });

  it('POST /api/deals/[id]/checklist/shift 404s and does not write DealChecklistItem', async () => {
    const res = await shiftChecklist(
      new NextRequest('http://localhost/api/deals/deal_victim/checklist/shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 7 }),
      }),
      { params: Promise.resolve({ id: 'deal_victim' }) },
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('DealChecklistItem');
  });

  it('GET /api/notes 404s and does not query Note', async () => {
    const res = await listNotes(new NextRequest('http://localhost/api/notes?slug=victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Note');
  });

  it('POST /api/notes 404s and does not insert Note', async () => {
    const res = await postNote(
      new NextRequest('http://localhost/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'victim', title: 'Chase VICTIM' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Note');
  });

  it('GET /api/message-templates 404s and does not query MessageTemplate', async () => {
    const res = await listMessageTemplates();
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('MessageTemplate');
  });

  it('POST /api/message-templates 404s and does not insert MessageTemplate', async () => {
    const res = await postMessageTemplate(
      new NextRequest('http://localhost/api/message-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Chase VICTIM', channel: 'sms', body: 'Call 555-0100' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('MessageTemplate');
  });

  it('GET /api/calls 404s and does not query CallLog', async () => {
    const res = await listCalls(new NextRequest('http://localhost/api/calls?slug=victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('CallLog');
    expect(fromMockTables).not.toContain('Contact');
  });

  it('POST /api/calls 404s and does not insert CallLog', async () => {
    const res = await postCall(
      new NextRequest('http://localhost/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'victim', toNumber: '+15557654321', contactId: 'c_victim' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('CallLog');
    expect(fromMockTables).not.toContain('Contact');
  });

  it('GET /api/saved-views 404s and does not query SavedView', async () => {
    const res = await listSavedViews(
      new NextRequest('http://localhost/api/saved-views?slug=victim&entity=contact'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('SavedView');
  });

  it('POST /api/saved-views 404s and does not insert SavedView', async () => {
    const res = await postSavedView(
      new NextRequest('http://localhost/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'victim',
          entity: 'contact',
          name: 'Chase VICTIM',
          filters: { q: '555-0100' },
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('SavedView');
  });

  it('GET /api/search 404s and does not query Contact, Deal, or Tour', async () => {
    const res = await searchWorkspace(
      new NextRequest('http://localhost/api/search?slug=victim&q=VICTIM'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
    expect(fromMockTables).not.toContain('Deal');
    expect(fromMockTables).not.toContain('Tour');
  });

  it('POST /api/push/subscribe 404s and does not upsert PushSubscription', async () => {
    const res = await postPushSubscribe(
      new NextRequest('http://localhost/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'victim',
          subscription: {
            endpoint: 'https://push.example/victim',
            keys: { p256dh: 'pkey', auth: 'akey' },
          },
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('PushSubscription');
  });

  it('DELETE /api/push/subscribe 404s and does not delete PushSubscription', async () => {
    const res = await deletePushSubscribe(
      new NextRequest('http://localhost/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'victim', endpoint: 'https://push.example/victim' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('PushSubscription');
  });

  it('GET /api/tours 404s and does not query Tour', async () => {
    const res = await listTours(new NextRequest('http://localhost/api/tours?slug=victim'));
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Tour');
    expect(fromMockTables).not.toContain('Contact');
  });

  it('POST /api/tours 404s and does not write Tour', async () => {
    const res = await postTour(
      new NextRequest('http://localhost/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'victim',
          guestName: 'Ada',
          guestEmail: 'ada@example.com',
          startsAt: '2026-08-22T15:00:00.000Z',
          endsAt: '2026-08-22T16:00:00.000Z',
          contactId: 'c_victim',
        }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Tour');
    expect(fromMockTables).not.toContain('Contact');
  });

  it('GET /api/contacts/duplicates 404s and does not query Contact', async () => {
    const res = await listDuplicates(
      new NextRequest('http://localhost/api/contacts/duplicates?slug=victim'),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
  });

  it('POST /api/contacts/bulk 404s and does not write Contact', async () => {
    const res = await postContactsBulk(
      new NextRequest('http://localhost/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'victim', ids: ['c_victim'], action: 'archive' }),
      }),
    );
    expect(res.status).toBe(404);
    noPii(JSON.stringify(await res.json()));
    expect(fromMockTables).not.toContain('Contact');
  });
});
