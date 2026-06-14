/**
 * Integration META-TOOLS for the in-process chat agent — the scalable answer
 * to "the realtor has 44 integrations, don't load them all every turn."
 *
 * Instead of pre-loading every connected toolkit's actions (~30 schemas ×
 * N toolkits, re-shipped on every step), the chat agent carries just TWO
 * tools:
 *   - find_integration_tool(query)        — search connected apps for an action
 *   - call_integration_tool(slug, args)   — execute one action by slug
 *
 * This is the standard tool-retrieval / dispatcher pattern (the same one the
 * Modal/Python agent already runs via the internal HTTP routes). It's pure
 * function-calling, so it works on any OpenRouter model — no Anthropic
 * defer_loading, no beta headers. The per-turn integration footprint is two
 * tool schemas regardless of how many apps are connected; the actual action
 * schema is fetched only when the model searches for it.
 *
 * Approval parity: call_integration_tool gates per action exactly like the old
 * per-action path did (`actionNeedsApproval`) — sends/posts/messages prompt the
 * realtor; reads run straight through.
 */

import { tool, type Tool as SdkTool } from '@openai/agents';
import { searchIntegrationActions } from './search';
import { executeToolForEntity } from './composio';
import { actionNeedsApproval } from './agent-tools';
import type { ToolContext } from '@/lib/ai-tools/types';
import { logger } from '@/lib/logger';

/** Cap the execute result echoed into context — it re-sends on later steps. */
const MAX_RESULT_CHARS = 4_000;

/** Derive a toolkit slug from an action slug (GMAIL_SEND_EMAIL → gmail). Used
 *  only for the approval-category lookup; the action-segment check in
 *  `actionNeedsApproval` is the real safety net and works on the slug alone. */
function toolkitFromSlug(slug: string): string {
  const i = slug.indexOf('_');
  return (i > 0 ? slug.slice(0, i) : slug).toLowerCase();
}

/**
 * Build the two integration meta-tools, bound to this turn's context. Cheap:
 * no Composio call at build time — the search hits Composio only when the
 * model actually calls find_integration_tool.
 */
export function buildIntegrationSearchTools(ctx: ToolContext): SdkTool[] {
  const findTool = tool({
    name: 'find_integration_tool',
    description:
      "Search the realtor's connected apps (Gmail, Slack, HubSpot, calendar, etc.) for an action to do a task. Returns matching tool slugs + schemas. Call this first when the task needs an external app, then call_integration_tool with a slug.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural-language description of what you need to do (e.g. "send a slack message", "list my recent emails", "create a hubspot contact").',
        },
        limit: { type: 'number', description: 'Max results, 1-10. Default 8.' },
      },
      required: ['query'],
      additionalProperties: true,
    },
    strict: false,
    needsApproval: false,
    async execute(input: unknown) {
      const { query, limit } = (input ?? {}) as { query?: string; limit?: number };
      const q = (query ?? '').trim();
      if (!q) return JSON.stringify({ tools: [], error: 'query is required' });
      try {
        const tools = await searchIntegrationActions({
          spaceId: ctx.space.id,
          userId: ctx.userId,
          query: q,
          limit: Math.max(1, Math.min(10, Math.floor(limit ?? 8))),
        });
        if (tools.length === 0) {
          return JSON.stringify({
            tools: [],
            note: 'No matching action in connected apps. Tell the realtor plainly; do not retry endlessly.',
          });
        }
        return JSON.stringify({ tools });
      } catch (err) {
        logger.warn('[integrations.find_integration_tool] search failed', { spaceId: ctx.space.id }, err);
        return JSON.stringify({ tools: [], error: 'search failed' });
      }
    },
  }) as SdkTool;

  const callTool = tool({
    name: 'call_integration_tool',
    description:
      'Execute ONE connected-app action by slug (use a slug from find_integration_tool). Provide arguments matching the action schema as a JSON string.',
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Action slug from find_integration_tool (e.g. GMAIL_SEND_EMAIL).',
        },
        arguments_json: {
          type: 'string',
          description: 'JSON-encoded arguments for the action; "{}" if none.',
        },
      },
      required: ['slug', 'arguments_json'],
      additionalProperties: true,
    },
    strict: false,
    // Gate per action — sends/posts/messages prompt the realtor, reads run
    // straight through. Same policy the old per-action path used.
    needsApproval: async (_runCtx: unknown, input: unknown) => {
      const slug = ((input ?? {}) as { slug?: string }).slug ?? '';
      return actionNeedsApproval(slug, toolkitFromSlug(slug));
    },
    async execute(input: unknown) {
      const { slug, arguments_json } = (input ?? {}) as { slug?: string; arguments_json?: string };
      const cleanSlug = (slug ?? '').trim();
      if (!cleanSlug) return JSON.stringify({ ok: false, error: 'slug is required' });

      let args: Record<string, unknown> = {};
      if (arguments_json) {
        try {
          const parsed = JSON.parse(arguments_json);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>;
          }
        } catch (e) {
          return JSON.stringify({ ok: false, error: `bad arguments JSON: ${e instanceof Error ? e.message : String(e)}` });
        }
      }

      try {
        const result = (await executeToolForEntity({
          entityId: ctx.userId,
          slug: cleanSlug,
          arguments: args,
        })) as { successful?: boolean; error?: unknown; data?: unknown };
        const ok = result.successful !== false;
        const errMsg = result.error
          ? typeof result.error === 'string'
            ? result.error
            : JSON.stringify(result.error)
          : undefined;
        const payload = JSON.stringify({
          ok,
          data: ok ? (result.data ?? {}) : undefined,
          error: ok ? undefined : `${cleanSlug} failed: ${errMsg ?? 'unknown error'}`,
        });
        return payload.length > MAX_RESULT_CHARS
          ? `${payload.slice(0, MAX_RESULT_CHARS)}…[truncated — ask for a narrower query if more detail is needed]`
          : payload;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('[integrations.call_integration_tool] execute failed', { spaceId: ctx.space.id, slug: cleanSlug }, err);
        return JSON.stringify({ ok: false, error: `${cleanSlug} failed: ${msg}` });
      }
    },
  }) as SdkTool;

  return [findTool, callTool];
}
