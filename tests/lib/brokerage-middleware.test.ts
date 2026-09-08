import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: (handler: unknown) => handler,
  createRouteMatcher: (patterns: string[]) => (req: NextRequest) => patterns.some(pattern => new RegExp(`^${pattern}$`).test(req.nextUrl.pathname)),
}));
vi.mock('@/lib/observability', () => ({ captureError: vi.fn() }));
import middleware from '@/middleware';
// Execute the actual middleware body with an authenticated synthetic session.
const handle = middleware as unknown as (auth: () => Promise<unknown>, request: NextRequest) => Promise<Response>;
const auth = async () => ({userId:'clerk-a',sessionClaims:{}});
describe('brokerage middleware wiring', () => {
  it('overwrites a supplied scope header with tab context for APIs', async () => {
    const response=await handle(auth,new NextRequest('https://app.test/api/broker/people',{headers:{referer:'https://app.test/broker/people?brokerage=broker-a',cookie:'chippi-brokerage=broker-b','x-chippi-brokerage':'broker-b'}}));
    expect(response.headers.get('x-middleware-request-x-chippi-brokerage')).toBe('broker-a');
  });
  it('canonicalizes page navigation and disables caching of the redirect', async () => {
    const response=await handle(auth,new NextRequest('https://app.test/broker/deals',{headers:{referer:'https://app.test/broker/people?brokerage=broker-a',cookie:'chippi-brokerage=broker-b'}}));
    expect(response.headers.get('location')).toBe('https://app.test/broker/deals?brokerage=broker-a');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('fails closed for API calls with no request context', async () => {
    const response=await handle(auth,new NextRequest('https://app.test/api/broker/people',{headers:{cookie:'chippi-brokerage=broker-b'}}));
    expect(response.headers.get('x-middleware-request-x-chippi-brokerage')).toBe('__unavailable_brokerage__');
  });
});
