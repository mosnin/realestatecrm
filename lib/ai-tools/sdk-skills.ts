/**
 * SDK-native sub-agent factories.
 *
 * The custom loop's `delegate_to_subagent` (lib/ai-tools/skills/*) hand-rolls
 * routing, system-prompt prefixing, and a tool allowlist per skill. The
 * `@openai/agents` SDK gives all of that for free via `Agent.asTool()`:
 * the parent agent calls a tool, the tool spins up the sub-agent with its
 * own context window + tool subset, returns the final text. Same boundary,
 * a fraction of the code.
 *
 * This module builds the two existing skills as SDK Agents. The chat
 * runtime (`sdk-chat.ts`) attaches them via `.asTool()` so the model
 * picks `analyze_pipeline` / `research_person` instead of the generic
 * `delegate_to_subagent` indirection.
 *
 * The custom loop keeps its own `delegate_to_subagent`. We don't wire it
 * into the SDK runtime — the SDK path uses asTool handoffs and never
 * touches the router.
 */

import { Agent } from '@openai/agents';
import { toSdkTool } from './sdk-bridge';
import { ALL_TOOLS } from './tools';
import type { ToolContext, ToolDefinition } from './types';

const DEFAULT_MODEL = 'gpt-4.1-mini';

/**
 * Pull tools by name from `ALL_TOOLS`. Unknown names throw at build time —
 * a typo here is a boot failure, not a silent runtime miss.
 */
function pickTools(names: readonly string[]): ToolDefinition[] {
  const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
  return names.map((n) => {
    const t = byName.get(n);
    if (!t) throw new Error(`sdk-skills: unknown tool "${n}"`);
    return t;
  });
}

/**
 * Pipeline analyst — surveys the deal pipeline and reports stuck deals,
 * quiet hot persons, and overdue follow-ups in one paragraph.
 */
export function buildPipelineAnalystAgent(ctx: ToolContext, opts: { model?: string } = {}): Agent {
  const tools = pickTools([
    'pipeline_summary',
    'find_stuck_deals',
    'find_quiet_hot_persons',
    'find_overdue_followups',
    'find_deal',
  ]).map((t) => toSdkTool(t, ctx));

  return new Agent({
    name: 'pipeline_analyst',
    instructions:
      'You analyze the pipeline. Surface stuck deals, quiet hot persons, and overdue follow-ups. Return one paragraph the realtor can act on.',
    tools,
    model: opts.model ?? DEFAULT_MODEL,
  });
}

/**
 * Contact researcher — digs up everything we know about one person and
 * recommends the next reasonable action.
 */
export function buildContactResearcherAgent(ctx: ToolContext, opts: { model?: string } = {}): Agent {
  const tools = pickTools([
    'find_person',
    'find_deal',
    'recall_history',
  ]).map((t) => toSdkTool(t, ctx));

  return new Agent({
    name: 'contact_researcher',
    instructions:
      'You research a person across their notes, activities, and deals. Return one paragraph naming the next reasonable action.',
    tools,
    model: opts.model ?? DEFAULT_MODEL,
  });
}
