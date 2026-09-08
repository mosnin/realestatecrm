import { describe, expect, it } from 'vitest';
import { brokerageRequestScope, BROKERAGE_HEADER, INVALID_BROKERAGE } from '@/lib/workspaces/brokerage-request';
const scope = (path: string, ref?: string, cookie = 'broker-b', method = 'GET') => brokerageRequestScope({
  url: `https://app.test${path}`, method, cookie,
  headers: new Headers(ref ? { referer: ref, [BROKERAGE_HEADER]: 'forged' } : { [BROKERAGE_HEADER]: 'forged' }),
});
describe('request-bound brokerage selection', () => {
  it('keeps reads and writes on tab A after tab B changes the landing cookie', () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const a = scope('/api/broker/leads', 'https://app.test/broker/people?brokerage=broker-a', 'broker-b', method);
      const b = scope('/api/broker/leads', 'https://app.test/broker/people?brokerage=broker-b', 'broker-a', method);
      expect(a.headers.get(BROKERAGE_HEADER)).toBe('broker-a');
      expect(b.headers.get(BROKERAGE_HEADER)).toBe('broker-b');
    }
  });
  it('pins ordinary navigation to its source tab and retains filters', () => {
    expect(scope('/broker/deals?stage=active', 'https://app.test/broker/people?brokerage=broker-a').redirectTo)
      .toBe('/broker/deals?stage=active&brokerage=broker-a');
  });
  it('honors an explicit URL over the previous tab and the cookie', () => {
    const result = scope('/broker/people?brokerage=broker-c', 'https://app.test/broker/people?brokerage=broker-a');
    expect(result.redirectTo).toBeUndefined();
    expect(result.headers.get(BROKERAGE_HEADER)).toBe('broker-c');
  });
  it('uses the cookie only for an initial page landing', () => {
    expect(scope('/broker').redirectTo).toBe('/broker?brokerage=broker-b');
    expect(scope('/api/broker/leads').headers.get(BROKERAGE_HEADER)).toBe(INVALID_BROKERAGE);
    expect(scope('/broker/settings', undefined, 'broker-b', 'POST').headers.get(BROKERAGE_HEADER)).toBe(INVALID_BROKERAGE);
  });
  it('does not silently retarget an old unbound brokerage tab', () => {
    expect(scope('/api/broker/leads', 'https://app.test/broker/people').headers.get(BROKERAGE_HEADER)).toBe(INVALID_BROKERAGE);
    expect(scope('/broker/deals', 'https://app.test/broker/people').headers.get(BROKERAGE_HEADER)).toBe(INVALID_BROKERAGE);
  });
  it('allows an explicit recovery to clear a stale tab and cookie', () => {
    const result=scope('/broker?choose=1', 'https://app.test/broker?brokerage=revoked', 'revoked');
    expect(result.headers.get(BROKERAGE_HEADER)).toBe('');
    expect(result.redirectTo).toBeUndefined();
    expect(scope('/broker?choose=1&brokerage=broker-a').headers.get(BROKERAGE_HEADER)).toBe('broker-a');
  });
  it('accepts explicit API context when the browser does not supply a referrer', () => {
    expect(scope('/api/broker/leads?brokerage=broker-a').headers.get(BROKERAGE_HEADER)).toBe('broker-a');
  });
  it.each(['https://evil.test/broker?brokerage=broker-a', 'https://app.test/s/alex?brokerage=broker-a', 'invalid'])('rejects unrelated referrer %s', ref => {
    expect(scope('/api/broker/leads', ref).headers.get(BROKERAGE_HEADER)).toBe(INVALID_BROKERAGE);
  });
  it.each(['', 'a&brokerage=b', '%0a'])('does not fall back on malformed explicit selection %s', id => {
    expect(scope(`/api/broker/leads?brokerage=${id}`).headers.get(BROKERAGE_HEADER)).toBe(INVALID_BROKERAGE);
  });
  it('does not redirect the explicit switch endpoint or retarget personal pages', () => {
    expect(scope('/broker/switch/broker-c').redirectTo).toBeUndefined();
    expect(scope('/s/alex/contacts').headers.has(BROKERAGE_HEADER)).toBe(false);
  });
});
