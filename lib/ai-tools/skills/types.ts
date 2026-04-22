/**
 * Skills — focused "personas" a sub-agent can wear.
 *
 * The Modal + OpenAI Agents SDK post frames context rot as the orchestrator
 * accumulating too much tool output over a long session. Their recommended
 * fix is an orchestrator that spawns DISPOSABLE sub-agents with a fresh
 * context window, a restricted tool set, and a focused system prompt;
 * when the sub-agent finishes, only a short summary crosses the boundary
 * back into the orchestrator's transcript.
 *
 * Skills are the typed bundle that describes one of those personas:
 *   - `name`            — how the orchestrator addresses it (`delegate_to_subagent` args)
 *   - `description`     — what the orchestrator reads when deciding to invoke it
 *   - `systemPrompt`    — the sub-agent's private instructions
 *   - `toolAllowlist`   — tool names the sub-agent may call (subset of the global registry)
 *   - `maxRounds?`      — tool-use loop cap; defaults tighter than the main loop
 *
 * Critical invariant: Phase 7 sub-agents are READ-ONLY. The orchestrator
 * retains exclusive control over mutating tools + approval prompts.
 * Allowing a mutation inside a sub-agent would require bubbling
 * `permission_required` events up across the skill boundary — doable later
 * but explicitly out of scope for the first version. The `toolAllowlist`
 * is validated at registration time to refuse any tool whose
 * `requiresApproval` is truthy.
 */

import type { ToolDefinition } from '../types';

export interface Skill {
  /** snake_case identifier the orchestrator uses. Unique across the registry. */
  name: string;
  /** One-sentence "why would you call this?" for the orchestrator. */
  description: string;
  /**
   * The sub-agent's system prompt — focused, domain-specific, and short.
   * Prepended with a small harness preamble (space + "be concise") so
   * skills don't have to repeat boilerplate.
   */
  systemPrompt: string;
  /** Tool names from the global registry. Must all be read-only. */
  toolAllowlist: string[];
  /**
   * Tool-use loop cap for this skill. The main loop uses 8; most research
   * skills are tighter (3-4) so a runaway delegation can't burn 8 rounds
   * of budget on the orchestrator's clock.
   */
  maxRounds?: number;
}

/**
 * Validate a skill at registration time — fails fast if a skill declares
 * a tool that either doesn't exist or is mutating. Returns the skill
 * unchanged on success so callers can chain `registerSkill(...)` into a
 * top-level module export.
 */
export function validateSkill(skill: Skill, allTools: ToolDefinition[]): Skill {
  const toolByName = new Map(allTools.map((t) => [t.name, t]));
  for (const toolName of skill.toolAllowlist) {
    const tool = toolByName.get(toolName);
    if (!tool) {
      throw new Error(
        `Skill "${skill.name}" declares unknown tool "${toolName}" in toolAllowlist.`,
      );
    }
    // A skill that could trigger mutations from a sub-agent context would
    // bypass the orchestrator's approval flow — refuse at boot.
    if (tool.requiresApproval !== false) {
      throw new Error(
        `Skill "${skill.name}" cannot include tool "${toolName}" — sub-agents are read-only.`,
      );
    }
  }
  return skill;
}
