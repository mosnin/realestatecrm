import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
const http = httpRouter();
for (const operation of ['enqueue', 'claim', 'list'] as const) {
  http.route({ path: `/follow-ups/${operation}`, method: 'POST', handler: httpAction(async (ctx, request) => {
    const secret = process.env.CHIPPI_CONVEX_SECRET;
    if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
    try {
      const args = await request.json();
      const result = operation === 'list' ? await ctx.runQuery(internal.followUps.list, args)
        : operation === 'claim' ? await ctx.runMutation(internal.followUps.claim, args)
        : await ctx.runMutation(internal.followUps.enqueue, args);
      return Response.json(result);
    } catch { return Response.json({ error: 'Operation failed' }, { status: 400 }); }
  }) });
}
export default http;
