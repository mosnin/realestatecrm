import { authorizeWorkforceRequest } from '@/lib/workforce/authorize';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    await authorizeWorkforceRequest(request);
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  } catch (error) { return new Response(null, { status: error instanceof RangeError ? 413 : 403 }); }
}
