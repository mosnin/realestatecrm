import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { signWorkforceRequest } from '@/integrations/cadre/packages/core/src/node/workforce-auth';
import { resolveWorkforceScope } from './scope';

export const WORKFORCE_MAX_BODY = 16 * 1024 * 1024;
export async function proxyWorkforce(request: Request, kind: string, id: string, segments: string[]) {
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true') return Response.json({ error: 'Workforce is not enabled' }, { status: 503 });
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // The route is a fixed runtime gateway, never an arbitrary URL proxy.
  if (!segments.length || segments.some(s => !s || s === '.' || s === '..' || /[\\/?#%]/.test(s)) || !['rpc', 'api'].includes(segments[0])) return new Response(null, { status: 404 });
  const url = new URL(request.url);
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== url.origin) return new Response(null, { status: 403 });
  const secret = process.env.CHIPPI_WORKFORCE_SECRET;
  const origin = process.env.CHIPPI_WORKFORCE_API_ORIGIN;
  if (!secret || secret.length < 32 || !origin) return Response.json({ error: 'Workforce is not configured' }, { status: 503 });
  const upstream = new URL(origin);
  if (upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash || (upstream.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['127.0.0.1', 'localhost'].includes(upstream.hostname)))) return new Response(null, { status: 503 });
  let scope;
  try { scope = await resolveWorkforceScope(kind, id, userId); } catch { return new Response(null, { status: 403 }); }
  if (Number(request.headers.get('content-length') ?? 0) > WORKFORCE_MAX_BODY) return new Response(null, { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > WORKFORCE_MAX_BODY) { await reader.cancel(); return new Response(null, { status: 413 }); }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks);
  const path = '/' + segments.map(encodeURIComponent).join('/') + url.search;
  const token = signWorkforceRequest(secret, scope.principal, request.method, path, body);
  const headers = new Headers({ 'x-chippi-authorization': token });
  for (const key of ['content-type', 'accept', 'last-event-id']) { const value = request.headers.get(key); if (value) headers.set(key, value); }
  try {
    const response = await fetch(new URL(path, upstream), { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : body, redirect: 'error', cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]) });
    const output = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    for (const key of ['content-type', 'content-disposition']) { const value = response.headers.get(key); if (value) output.set(key, value); }
    const upstreamReader = response.body?.getReader();
    let checkedAt = Date.now();
    const stream = upstreamReader ? new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await upstreamReader.read();
          if (next.done) { controller.close(); return; }
          // Long-lived activity/computer streams must also lose access after offboarding.
          if (Date.now() - checkedAt >= 15_000) {
            const current = await resolveWorkforceScope(kind, id, userId);
            if (current.principal.scopeId !== scope.principal.scopeId || current.principal.role !== scope.principal.role) throw new Error('Authority changed');
            checkedAt = Date.now();
          }
          controller.enqueue(next.value);
        } catch { await upstreamReader.cancel().catch(() => undefined); controller.error(new Error('Workforce connection ended')); }
      },
      cancel(reason) { return upstreamReader.cancel(reason); },
    }) : null;
    return new Response(stream, { status: response.status, headers: output });
  } catch { return Response.json({ error: 'Workforce runtime unavailable' }, { status: 502 }); }
}
