import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { auth } from '@clerk/nextjs/server';
import { listWorkforceScopes, resolveWorkforceScope } from '@/lib/workforce/scope';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string; path?: string[] }> }) {
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true') return new Response('Workforce is not enabled', { status: 404 });
  const { userId } = await auth();
  if (!userId) return Response.redirect(new URL('/login/realtor', request.url));
  const { kind, id, path: segments = [] } = await context.params;
  if (segments.length && segments[0] !== 'app' && segments[0] !== 'mcp') return new Response(null, { status: 404 });
  let scope;
  try { scope = await resolveWorkforceScope(kind, id, userId); } catch { return new Response('Workspace access unavailable', { status: 403 }); }
  try {
    const html = await readFile(path.join(process.cwd(), 'public/workforce-assets/index.html'), 'utf8');
    const basePath = `/workforce/${kind}/${encodeURIComponent(id)}`;
    const workspaces = await listWorkforceScopes(userId);
    const config = JSON.stringify({ kind, workspaces, basePath, apiBase: `/api/workforce/${kind}/${encodeURIComponent(id)}`, crmHref: scope.crmHref, name: scope.principal.name, role: kind === 'team' ? `Team ${scope.principal.role}` : scope.principal.role === 'admin' ? 'Brokerage admin' : (kind === 'brokerage' ? 'Brokerage owner' : 'Agent workspace') }).replace(/</g, '\\u003c');
    return new Response(html.replace('<html lang="en">', '<html lang="en" data-chippi-host>').replace('</head>', `<script type="application/json" id="chippi-host">${config}</script></head>`), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff' } });
  } catch { return new Response('Workforce client is not installed', { status: 503 }); }
}
