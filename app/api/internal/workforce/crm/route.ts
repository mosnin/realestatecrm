import { authorizeWorkforceRequest } from '@/lib/workforce/authorize';
import { queryWorkforceCrm } from '@/lib/workforce/crm';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function POST(request: Request) {
  let authority;
  try { authority = await authorizeWorkforceRequest(request); }
  catch (error) { return new Response(null, { status: error instanceof RangeError ? 413 : 403 }); }
  try {
    const input = JSON.parse(Buffer.from(authority.bytes).toString('utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input)) return new Response(null, { status: 400 });
    const result = await queryWorkforceCrm(authority.principal, authority.clerkId, input, request.signal);
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch { return Response.json({ error: 'CRM query unavailable or outside this workspace' }, { status: 400 }); }
}
