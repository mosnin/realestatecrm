import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@/lib/workforce/scope', () => ({ resolveWorkforceScope: vi.fn() }));
import { auth } from '@clerk/nextjs/server';
import { resolveWorkforceScope } from '@/lib/workforce/scope';
import { proxyWorkforce } from '@/lib/workforce/proxy';
import { verifyWorkforceRequest } from '@/integrations/cadre/packages/core/src/node/workforce-auth';
const principal = { actorId: 'actor', kind: 'personal' as const, scopeId: 'space', routeId: 'slug', name: 'Synthetic workspace', role: 'owner' as const };
const secret = 'test-only-workforce-secret-'.repeat(3);
const fetchMock = vi.fn();
const request = (headers: Record<string, string> = {}, body = '{}') => new Request('https://crm.example/api/workforce/personal/slug/rpc/task', { method: 'POST', headers: { origin: 'https://crm.example', 'content-type': 'application/json', ...headers }, body });
beforeEach(() => {
  vi.stubEnv('CHIPPI_WORKFORCE_ENABLED', 'true'); vi.stubEnv('CHIPPI_WORKFORCE_SECRET', secret); vi.stubEnv('CHIPPI_WORKFORCE_API_ORIGIN', 'https://runtime.example');
  vi.mocked(auth).mockResolvedValue({ userId: 'clerk_actor' } as never);
  vi.mocked(resolveWorkforceScope).mockResolvedValue({ principal, crmHref: '/s/slug', routeId: 'slug' });
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('authenticated Workforce gateway', () => {
  it('binds live scope and strips browser credentials and upstream cookies', async () => {
    fetchMock.mockResolvedValue(new Response('receipt', { headers: { 'set-cookie': 'other=secret', 'content-type': 'text/plain', location: 'https://evil.example' } }));
    const response = await proxyWorkforce(request({ cookie: 'clerk=private', authorization: 'Bearer private', 'x-rakazo-space-id': 'victim' }), 'personal', 'slug', ['rpc', 'task']);
    expect(response.status).toBe(200); expect(await response.text()).toBe('receipt');
    expect(response.headers.has('set-cookie')).toBe(false); expect(response.headers.has('location')).toBe(false);
    const [url, init] = fetchMock.mock.calls[0]; expect(url.toString()).toBe('https://runtime.example/rpc/task');
    expect(init.headers.has('cookie')).toBe(false); expect(init.headers.has('authorization')).toBe(false); expect(init.headers.has('x-rakazo-space-id')).toBe(false);
    expect(verifyWorkforceRequest(secret, init.headers.get('x-chippi-authorization'), 'POST', '/rpc/task', init.body).principal).toEqual(principal);
    expect(init.redirect).toBe('error');
  });
  it('rejects cross-origin mutation and revoked membership without contacting runtime', async () => {
    expect((await proxyWorkforce(request({ origin: 'https://evil.example' }), 'personal', 'slug', ['rpc', 'task'])).status).toBe(403);
    vi.mocked(resolveWorkforceScope).mockRejectedValue(new Error('revoked'));
    expect((await proxyWorkforce(request(), 'personal', 'slug', ['rpc', 'task'])).status).toBe(403); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not forward traversal, arbitrary upstream paths, or unauthenticated traffic', async () => {
    for (const segments of [['rpc', '..'], ['rpc', '%2fadmin'], ['health'], ['https:', 'evil.example']]) expect((await proxyWorkforce(request(), 'personal', 'slug', segments)).status).toBe(404);
    vi.mocked(auth).mockResolvedValue({ userId: null } as never);
    expect((await proxyWorkforce(request(), 'personal', 'slug', ['rpc', 'task'])).status).toBe(401); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports unavailable runtime honestly', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect((await proxyWorkforce(request(), 'personal', 'slug', ['rpc', 'task'])).status).toBe(502);
  });
});
