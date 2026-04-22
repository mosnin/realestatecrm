/**
 * Central registry of tools available to the on-demand agent loop.
 *
 * Tools register themselves via the array in `tools/index.ts`. Keeping the
 * list explicit (rather than dynamic file-system scanning) means the full
 * catalog is obvious at a glance — helpful when debugging what the model
 * has access to during a given turn.
 */

import { ALL_TOOLS } from './tools';
import { delegateToSubagentTool } from './tools/delegate-to-subagent';
import type { ToolDefinition } from './types';

// The orchestrator-facing tool set = domain tools + the meta delegation
// tool. Keeping delegateToSubagentTool outside ./tools/index.ts breaks a
// latent cycle: delegate → skills/registry → tools (for skill-allowlist
// validation). Adding it here means validateSkill still sees a clean
// domain-only pool and can't accidentally permit sub-agent recursion.
const COMBINED: ToolDefinition[] = [
  ...ALL_TOOLS,
  delegateToSubagentTool as ToolDefinition,
];

const REGISTRY: Map<string, ToolDefinition> = new Map(
  COMBINED.map((t) => [t.name, t as ToolDefinition]),
);

// Guardrail: duplicate names would silently lose a tool on Map insertion.
if (REGISTRY.size !== COMBINED.length) {
  const seen = new Set<string>();
  for (const t of COMBINED) {
    if (seen.has(t.name)) {
      throw new Error(`Duplicate tool name in registry: ${t.name}`);
    }
    seen.add(t.name);
  }
}

/** Look up a tool by name. Returns `undefined` for unknown names. */
export function getTool(name: string): ToolDefinition | undefined {
  return REGISTRY.get(name);
}

/** Full list of tools. Used to build the OpenAI `tools` array on each turn. */
export function listTools(): ToolDefinition[] {
  return Array.from(REGISTRY.values());
}

/** Does this tool need the user's approval before running? */
export function toolRequiresApproval<TArgs>(
  tool: ToolDefinition<TArgs>,
  args: TArgs,
  ctx: Parameters<ToolDefinition<TArgs>['handler']>[1],
): boolean {
  if (tool.requiresApproval === true) return true;
  if (tool.requiresApproval === false) return false;
  return tool.shouldApprove ? tool.shouldApprove(args, ctx) : true;
}
