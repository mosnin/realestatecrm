/**
 * `delegate_to_subagent` — the orchestrator's handle on the skill registry.
 *
 * Auto-running (no approval prompt): a delegation is read-only by
 * construction (skills can only include read-only tools — enforced at
 * registration) and returns a text summary, so there's nothing for the
 * user to "approve" in the Claude Code sense. The orchestrator is still
 * on the hook for any mutation it performs AFTER reading the summary —
 * that call goes through its own approval flow.
 *
 * The tool's description enumerates the available skill names so the
 * model can choose without needing a separate "list_skills" step.
 */

import { z } from 'zod';
import { getOpenAIClient } from '../openai-client';
import { runSubAgent } from '../skills/run-sub-agent';
import { getSkill, listSkills } from '../skills/registry';
import { defineTool } from '../types';

/** Built at module load so the description reflects the current registry. */
const skillSummaries = listSkills()
  .map((s) => `- ${s.name}: ${s.description}`)
  .join('\n');

const skillNames = listSkills().map((s) => s.name) as [string, ...string[]];

const parameters = z
  .object({
    skill: z
      .enum(skillNames)
      .describe('Which skill to delegate to. Pick the one whose description best matches the task.'),
    task: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        'What you want the sub-agent to figure out. Be specific — include contact names, deal titles, or the question you want answered.',
      ),
  })
  .describe('Delegate a focused research task to a sub-agent so its raw findings do not bloat the main conversation.');

interface DelegateResult {
  skill: string;
  toolCalls: number;
  reason: 'complete' | 'max_rounds' | 'aborted' | 'error';
}

export const delegateToSubagentTool = defineTool<typeof parameters, DelegateResult>({
  name: 'delegate_to_subagent',
  description: `Delegate a read-only research task to a specialised sub-agent. The sub-agent has its own fresh context and returns one short paragraph — use this BEFORE pulling lots of data into the main conversation so you keep room to think. Available skills:\n${skillSummaries}`,
  parameters,
  requiresApproval: false,
  // Light rate limit — delegations are OpenAI calls, not cheap. 20/hour per
  // user is plenty for realistic use and bounds runaway loops.
  rateLimit: { max: 20, windowSeconds: 3600 },
  summariseCall(args) {
    return `Delegate to ${args.skill}: "${args.task.slice(0, 60)}${args.task.length > 60 ? '…' : ''}"`;
  },

  async handler(args, ctx) {
    const skill = getSkill(args.skill);
    if (!skill) {
      // Shouldn't happen — the zod enum enforces the list — but defend
      // against a registry drift where an older assistant message referenced
      // a since-removed skill name.
      return {
        summary: `Unknown skill "${args.skill}". Available: ${listSkills().map((s) => s.name).join(', ')}.`,
        display: 'error',
      };
    }

    let openai;
    try {
      openai = getOpenAIClient().client;
    } catch {
      return {
        summary: 'Cannot delegate — the AI provider is not configured.',
        display: 'error',
      };
    }

    const outcome = await runSubAgent({ skill, task: args.task, ctx, openai });

    if (outcome.reason === 'error') {
      return {
        summary: `Sub-agent "${args.skill}" failed: ${outcome.error ?? 'unknown error'}`,
        display: 'error',
      };
    }
    if (outcome.reason === 'aborted') {
      return {
        summary: `Sub-agent "${args.skill}" was cancelled before finishing.`,
        display: 'plain',
      };
    }

    // Both 'complete' and 'max_rounds' carry a usable summary. We surface
    // max_rounds with a prefix so the orchestrator can decide whether to
    // re-delegate with a narrower task.
    const prefix = outcome.reason === 'max_rounds' ? '[Partial — tool budget exhausted] ' : '';
    return {
      summary: prefix + outcome.summary,
      data: {
        skill: skill.name,
        toolCalls: outcome.toolCalls,
        reason: outcome.reason,
      },
      display: 'plain',
    };
  },
});
