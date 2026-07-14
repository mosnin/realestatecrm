/**
 * Minimal stub of the Supabase PostgREST API for the browser e2e suite.
 *
 * The app's public pages are SERVER-rendered from Supabase (service-role
 * client, lib/supabase.ts), so Playwright's browser-side route interception
 * can't mock them. Instead, playwright.config.ts points
 * NEXT_PUBLIC_SUPABASE_URL at this tiny HTTP server, which speaks just enough
 * PostgREST to make the covered pages deterministic:
 *
 *   - GET /rest/v1/Space?slug=eq.e2e-demo  → one seeded Space row, so
 *     /apply/e2e-demo renders the real intake surface. Any other slug → []
 *     so unknown slugs hit notFound() (a real 404, not a 500).
 *   - GET /rest/v1/User                    → one row, so the /status page's
 *     database probe ("select id limit 1") reports Operational.
 *   - Any other GET /rest/v1/<table>       → [] (postgrest-js `.maybeSingle()`
 *     treats a one-element array as the row and `[]` as null, so empty
 *     arrays are the correct "no row" answer everywhere).
 *   - Non-GET requests                     → 204 (writes are accepted and
 *     dropped; the suite never asserts on persisted writes).
 *
 * No external network, no Postgres, no Docker — one Node built-in HTTP server.
 */
import http from 'node:http';

const PORT = Number(process.env.STUB_SUPABASE_PORT || 55321);

const SPACE = {
  id: 'e2e-space-1',
  slug: 'e2e-demo',
  name: 'E2E Demo Realty',
  emoji: null,
  ownerId: 'e2e-user-1',
  brokerageId: null,
  createdAt: '2026-01-01T00:00:00Z',
  stripeSubscriptionStatus: null,
  stripePeriodEnd: null,
};

const USER = {
  id: 'e2e-user-1',
  name: 'E2E Agent',
  avatar: null,
  clerkId: null,
  platformRole: null,
};

/** @param {string} table @param {URLSearchParams} params */
function rowsFor(table, params) {
  switch (table) {
    case 'Space':
      return params.get('slug') === `eq.${SPACE.slug}` ? [SPACE] : [];
    case 'User':
      return [USER];
    default:
      return [];
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Accept-and-drop writes (e.g. avatar backfill UPDATEs).
    req.resume();
    req.on('end', () => {
      res.writeHead(204);
      res.end();
    });
    return;
  }

  const restMatch = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
  const body = restMatch
    ? JSON.stringify(rowsFor(decodeURIComponent(restMatch[1]), url.searchParams))
    : '{}';

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`[stub-supabase] listening on http://127.0.0.1:${PORT}`);
});
