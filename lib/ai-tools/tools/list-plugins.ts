/**
 * `list_plugins` — read-only companion to `use_plugin`: what custom plugins
 * the realtor has registered, with the descriptions that tell the model when
 * each applies. Auth headers are never included.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';

const parameters = z.object({}).describe("List the realtor's custom plugins.");

interface ListPluginsResult {
  plugins: { name: string; description: string; method: string; enabled: boolean }[];
}

export const listPluginsTool = defineTool<typeof parameters, ListPluginsResult>({
  name: 'list_plugins',
  riskLevel: 'safe',
  description:
    "List the realtor's registered custom plugins (their own HTTP tools) with descriptions of when to use each. Call before use_plugin if unsure what exists.",
  parameters,
  requiresApproval: false,

  async handler(_args, ctx) {
    const { data } = await supabase
      .from('CustomPlugin')
      .select('name, description, method, enabled')
      .eq('spaceId', ctx.space.id)
      .order('name', { ascending: true });

    const plugins = (data ?? []) as ListPluginsResult['plugins'];
    if (plugins.length === 0) {
      return { summary: 'No custom plugins registered. The realtor can add one on the Plugins page.', data: { plugins } };
    }
    const lines = plugins
      .map((p) => `${p.name}${p.enabled ? '' : ' (disabled)'} — ${p.description}`)
      .join('\n');
    return { summary: `${plugins.length} plugin(s):\n${lines}`, data: { plugins } };
  },
});
