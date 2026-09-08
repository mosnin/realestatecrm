/** A request selects a workspace; membership checks still authorize it. */
export const BROKERAGE_PARAM = 'brokerage';
export const BROKERAGE_HEADER = 'x-chippi-brokerage';
export const REQUEST_URL_HEADER = 'x-chippi-request-url';
export const INVALID_BROKERAGE = '__unavailable_brokerage__';

const isBrokerPage = (path: string) => path === '/broker' || path.startsWith('/broker/');
function selection(url: URL): string | undefined {
  if (!url.searchParams.has(BROKERAGE_PARAM)) return undefined;
  const values = url.searchParams.getAll(BROKERAGE_PARAM);
  return values.length === 1 && /^[a-zA-Z0-9_-]{1,200}$/.test(values[0])
    ? values[0] : INVALID_BROKERAGE;
}

export function brokerageUrl(path: string, id: string): string {
  const url = new URL(path, 'https://workspace.invalid');
  url.searchParams.set(BROKERAGE_PARAM, id);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Same-origin page context carries existing API clients and ordinary links.
 * A missing API context fails closed instead of following another tab's cookie.
 * The cookie is only a landing preference for a fresh dashboard navigation.
 */
export function brokerageRequestScope(input: {
  url: string; method: string; headers: Headers; cookie?: string;
}): { headers: Headers; redirectTo?: string } {
  const url = new URL(input.url);
  const headers = new Headers(input.headers);
  headers.delete(BROKERAGE_HEADER);
  headers.set(REQUEST_URL_HEADER, `${url.pathname}${url.search}`);
  const page = isBrokerPage(url.pathname) && !url.pathname.startsWith('/broker/switch/');
  const api = url.pathname.startsWith('/api/');
  // Explicit recovery starts a new selection without inheriting a stale tab.
  let id = page && url.searchParams.get('choose') === '1' && !url.searchParams.has(BROKERAGE_PARAM)
    ? '' : page || api ? selection(url) : undefined;
  if ((page || api) && id === undefined) {
    try {
      const ref = new URL(input.headers.get('referer') ?? '');
      if (ref.origin === url.origin && isBrokerPage(ref.pathname)) {
        id = selection(ref) ?? INVALID_BROKERAGE;
      }
    } catch { /* A missing or invalid referrer is not a workspace selection. */ }
  }
  if (page && id === undefined && input.method === 'GET') id = input.cookie;
  if (api || (page && input.method !== 'GET')) headers.set(BROKERAGE_HEADER, id ?? INVALID_BROKERAGE);
  else if (id !== undefined) headers.set(BROKERAGE_HEADER, id);
  if (page && input.method === 'GET' && id && !url.searchParams.has(BROKERAGE_PARAM)) {
    return { headers, redirectTo: brokerageUrl(`${url.pathname}${url.search}`, id) };
  }
  return { headers };
}
