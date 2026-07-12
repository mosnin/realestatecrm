/**
 * `use_plugin` — call one of the realtor's CUSTOM plugins (a user-defined
 * HTTP endpoint registered on the Plugins page). This is the "bring your own
 * tool" door: the realtor points Chippi at their own API (an MLS wrapper, an
 * internal brokerage service, a Zapier catch hook) and the model can reach it
 * by name.
 *
 * Approval-gated; the actual HTTP execution (SSRF guard, redirect:'manual',
 * safe dispatcher, timeout, response cap, auth-header attach) lives in
 * lib/plugins/call.ts — one code path shared with the Modal/Python runtime's
 * internal endpoint so the security posture can never drift.
 */

import { z } from 'zod';
import { callCustomPlugin } from '@/lib/plugins/call';
import { defineTool } from '../types';

const parameters = z
  .object({
    plugin: z.string().min(1).max(40).describe('The plugin name, exactly as listed (e.g. "mls-lookup").'),
    input: z
      .string()
      .max(4000)
      .optional()
      .describe('What to send. A JSON object string is passed as the request body as-is; plain text is wrapped as {"input": text}. For GET plugins it becomes the ?input= query param.'),
  })
  .describe("Call one of the realtor's custom plugins (user-registered HTTP tools).");

interface UsePluginResult {
  plugin: string;
  status: number;
  body: string;
}

export const usePluginTool = defineTool<typeof parameters, UsePluginResult>({
  name: 'use_plugin',
  riskLevel: 'high',
  description:
    "Call a custom plugin the realtor registered (their own HTTP API). Use when the realtor asks for something a plugin's description covers. Prompts for approval first.",
  parameters,
  requiresApproval: true,
  rateLimit: { max: 30, windowSeconds: 3600 },
  summariseCall(args) {
    return `Call plugin "${args.plugin}"${args.input ? ` with input (${args.input.length} chars)` : ''}`;
  },

  async handler(args, ctx) {
    const result = await callCustomPlugin(ctx.space.id, args.plugin, args.input);
    if (!result.ok) {
      return { summary: result.error, display: 'error' };
    }
    return {
      summary: result.httpOk
        ? `"${result.plugin}" responded ${result.status}.`
        : `"${result.plugin}" returned ${result.status} — the call did not succeed.`,
      display: result.httpOk ? 'success' : 'error',
      data: { plugin: result.plugin, status: result.status, body: result.body },
    };
  },
});
