import 'server-only';
import { readWorkforceBody, verifyWorkforceRequest } from '@/integrations/cadre/packages/core/src/node/workforce-auth';
import { supabase } from '@/lib/supabase';
import { resolveWorkforceScope } from './scope';

/** Server-to-server calls re-resolve current ownership; signed claims alone never grant access. */
export async function authorizeWorkforceRequest(request: Request) {
  const secret = process.env.CHIPPI_WORKFORCE_SECRET;
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true' || !secret) throw new Error('Workforce unavailable');
  const token = request.headers.get('x-chippi-authorization');
  if (!token) throw new Error('Unauthorized');
  const bytes = await readWorkforceBody(request, 64 * 1024);
  const url = new URL(request.url);
  const { principal } = verifyWorkforceRequest(secret, token, request.method, url.pathname + url.search, bytes);
  const { data: user, error } = await supabase.from('User').select('clerkId').eq('id', principal.actorId).maybeSingle();
  if (error || !user?.clerkId) throw new Error('Authority unavailable');
  let routeId = principal.scopeId;
  if (principal.kind === 'personal') {
    const { data: space, error } = await supabase.from('Space').select('slug').eq('id', principal.scopeId).maybeSingle();
    if (error || !space) throw new Error('Authority unavailable');
    routeId = space.slug;
  }
  const current = await resolveWorkforceScope(principal.kind, routeId, user.clerkId);
  if (current.principal.scopeId !== principal.scopeId || current.principal.role !== principal.role) throw new Error('Authority revoked');
  return { principal: current.principal, clerkId: user.clerkId, bytes };
}
