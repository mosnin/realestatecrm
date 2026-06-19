/**
 * Route-level test for POST /api/public/apply/brokerage — brokerage routing.
 *
 * The brokerage intake page (/apply/b/[brokerageId]) now POSTs here (see
 * resolveApplyEndpoint + tests/components/intake-chat-endpoint.test.ts). This
 * test pins the brokerage-only behavior that the per-realtor route does NOT
 * do, and that was silently skipped before the routing fix:
 *
 *   - routeBrokerageLead is invoked with the brokerage id + validated lead
 *     shape (auto-assignment).
 *   - When routing returns an agent, the Contact is inserted into the agent's
 *     space (not just the owner space).
 *   - The Contact carries the 'brokerage-lead' tag and source 'brokerage_form'.
 *   - notifyBroker fires for the brokerage.
 *
 * Supabase is a per-table terminal queue (mirrors contacts-merge.test.ts).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/redis', () => ({ redis: { set: vi.fn(async () => 'OK') } }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/lead-scoring', () => ({
  scoreLeadApplicationDynamic: vi.fn(async () => ({
    scoringStatus: 'scored',
    leadScore: 60,
    scoreLabel: 'warm',
    scoreSummary: 'ok',
    scoreDetails: null,
  })),
}));
vi.mock('@/lib/email', () => ({ sendApplicationConfirmation: vi.fn(async () => undefined) }));
vi.mock('@/lib/notification-voice', () => ({
  notificationForNewBrokerageLead: vi.fn(() => ({ title: 'New lead', description: 'desc' })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// The route has no dynamic form config in this test → legacy path.
vi.mock('@/lib/form-builder', () => ({
  getFormConfigs: vi.fn(async () => ({ rental: null, buyer: null, source: 'legacy' })),
  getDefaultFormConfig: vi.fn(() => null),
}));

const { notifyBrokerMock } = vi.hoisted(() => ({
  notifyBrokerMock: vi.fn((_params: Record<string, unknown>) => Promise.resolve()),
}));
vi.mock('@/lib/broker-notify', () => ({ notifyBroker: notifyBrokerMock }));

const { routeBrokerageLeadMock } = vi.hoisted(() => ({ routeBrokerageLeadMock: vi.fn() }));
vi.mock('@/lib/brokerage-routing', () => ({ routeBrokerageLead: routeBrokerageLeadMock }));

// ── Supabase per-table queue, capturing the Contact insert payload ───────────
type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}
let contactInsert: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.ilike = vi.fn(() => chain);
    chain.contains = vi.fn(() => chain);
    chain.gte = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.insert = vi.fn((values: Record<string, unknown>) => {
      if (table === 'Contact') contactInsert = values;
      return chain;
    });
    chain.update = vi.fn(() => chain);
    const next = (): Terminal => q.shift() ?? { data: null, error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(next()));
    chain.single = vi.fn(() => Promise.resolve(next()));
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import { POST } from '@/app/api/public/apply/brokerage/route';

const BROKERAGE_ID = '7db980fd-026c-46da-b2b2-29875eb083f5';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/public/apply/brokerage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Queue the brokerage lookup + space lookup + scoring/settings/insert flow.
function queueFlow() {
  // 1. Brokerage lookup (maybeSingle)
  queueFor('Brokerage').push({
    data: { id: BROKERAGE_ID, name: 'Acme Group', ownerId: 'owner_1', status: 'active', privacyPolicyHtml: null },
    error: null,
  });
  // 2. Brokerage form-config lookup inside fetchBrokerageFormConfig (maybeSingle)
  queueFor('Brokerage').push({ data: {}, error: null });
  // 3. Space: linked space lookup (maybeSingle)
  queueFor('Space').push({
    data: { id: 'owner_space', slug: 'acme', name: 'Acme', ownerId: 'owner_1', brokerageId: BROKERAGE_ID },
    error: null,
  });
  // 4. Contact: recent-dupe select (empty)
  queueFor('Contact').push({ data: [], error: null });
  // 5. SpaceSetting: settings select (maybeSingle)
  queueFor('SpaceSetting').push({
    data: { privacyPolicyUrl: null, businessName: 'Acme', intakeConfirmationEmail: null },
    error: null,
  });
  // 6. Contact: insert → select (row)
  queueFor('Contact').push({ data: [{ id: 'contact_1' }], error: null });
  // 7. Contact: scoring update
  queueFor('Contact').push({ data: null, error: null });
}

const VALID_BODY = {
  brokerageId: BROKERAGE_ID,
  leadType: 'rental',
  legalName: 'Jane Doe',
  email: 'jane@example.com',
  phone: '(555) 123-4567',
  monthlyRent: '2000',
  privacyConsent: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  contactInsert = null;
});

describe('POST /api/public/apply/brokerage — brokerage routing', () => {
  it('invokes routeBrokerageLead and inserts into the assigned agent space + tags the lead', async () => {
    routeBrokerageLeadMock.mockResolvedValue({
      agentUserId: 'agent_9',
      agentSpaceId: 'agent_space_9',
      method: 'round_robin',
      ruleId: null,
    });
    queueFlow();

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(201);

    // Auto-assignment ran with the brokerage id + validated lead shape.
    expect(routeBrokerageLeadMock).toHaveBeenCalledTimes(1);
    const [calledBrokerageId, lead] = routeBrokerageLeadMock.mock.calls[0];
    expect(calledBrokerageId).toBe(BROKERAGE_ID);
    expect(lead).toMatchObject({ leadType: 'rental' });
    expect((lead as { tags: string[] }).tags).toContain('brokerage-lead');

    // Contact landed in the routed agent's space, not the owner space.
    expect(contactInsert).not.toBeNull();
    expect(contactInsert!.spaceId).toBe('agent_space_9');
    expect(contactInsert!.brokerageId).toBe(BROKERAGE_ID);
    expect(contactInsert!.tags).toContain('brokerage-lead');
    expect(contactInsert!.source).toBe('brokerage_form');
    expect(contactInsert!.sourceLabel).toBe('brokerage-intake');

    // Broker dashboard notification fired for this brokerage.
    expect(notifyBrokerMock).toHaveBeenCalledTimes(1);
    expect(notifyBrokerMock.mock.calls[0][0]).toMatchObject({ brokerageId: BROKERAGE_ID });
  });

  it('falls back to the owner space when routing returns null (still a brokerage lead)', async () => {
    routeBrokerageLeadMock.mockResolvedValue(null);
    queueFlow();

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(201);

    expect(routeBrokerageLeadMock).toHaveBeenCalledTimes(1);
    expect(contactInsert).not.toBeNull();
    // No agent → owner space fallback, but it's still tagged a brokerage lead.
    expect(contactInsert!.spaceId).toBe('owner_space');
    expect(contactInsert!.tags).toContain('brokerage-lead');
    expect(notifyBrokerMock).toHaveBeenCalledTimes(1);
  });
});
