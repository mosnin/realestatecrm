/**
 * withObservability — minimal route handler wrapper.
 *
 * Runs the handler inside a named Sentry span so the route appears in
 * distributed traces. On an unhandled throw, the error is captured before
 * rethrowing so the original response / error boundary is unchanged.
 *
 * Usage:
 *   export const GET = withObservability(async (req, ctx) => { ... }, 'api.sync');
 */
import type { NextRequest } from 'next/server';
import { captureError, withSpan } from '@/lib/observability';

type RouteContext = { params?: Promise<Record<string, string>> };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>;

export function withObservability(handler: RouteHandler, opName: string): RouteHandler {
  return async (req: NextRequest, ctx: RouteContext): Promise<Response> => {
    try {
      return await withSpan(opName, 'http.server', () => handler(req, ctx));
    } catch (err) {
      captureError(err, { route: opName });
      throw err;
    }
  };
}
