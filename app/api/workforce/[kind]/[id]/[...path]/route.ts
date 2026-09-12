import { proxyWorkforce } from '@/lib/workforce/proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
type Context = { params: Promise<{ kind: string; id: string; path: string[] }> };
async function handler(request: Request, context: Context) {
  const { kind, id, path } = await context.params;
  return proxyWorkforce(request, kind, id, path);
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as HEAD };
