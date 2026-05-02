/**
 * The new in-process chat runtime, built on `@openai/agents`.
 *
 * This replaces the Modal/Python proxy at `app/api/ai/task/route.ts` when
 * `CHIPPI_CHAT_RUNTIME=ts` is set. The flag default is `'modal'`, so this
 * code is dormant until explicitly activated — see `runtime-flag.ts`.
 *
 * Two entry points:
 *
 *   - `runChatTurn` — fresh user message. Builds the agent with all 42
 *     tools converted via `toSdkTool`, calls `run(agent, input, { stream:
 *     true })`, returns the SDK's stream + the result handle so the route
 *     can persist after the stream closes.
 *   - `resumeChatTurn` — load a paused run, apply the realtor's approval
 *     decision, continue the run from where it paused.
 *
 * What we do NOT do here:
 *   - SSE encoding. The route owns the wire format; this module returns
 *     SDK events and the route maps + frames them.
 *   - Persistence of paused runs. The route writes to `AgentPausedRun`
 *     after a paused run lands. Keeping persistence in the route lets the
 *     bridge stay pure and testable.
 */

import { Agent, run, type RunState, type Tool as SdkTool } from '@openai/agents';
import {
  toSdkTool,
  restoreRunState,
  applyApprovalDecision,
  type ApprovalDecision,
} from './sdk-bridge';
import { buildPipelineAnalystAgent, buildContactResearcherAgent } from './sdk-skills';
import { buildSystemPrompt } from './system-prompt';
import { ALL_TOOLS } from './tools';
import type { ToolContext, ToolDefinition } from './types';
import { activeToolkits } from '@/lib/integrations/connections';
import { loadToolsForEntity, composioConfigured } from '@/lib/integrations/composio';
import { logger } from '@/lib/logger';

// ── Config ─────────────────────────────────────────────────────────────────

/** Same model the bridge defaults to. Cheap enough to absorb chat traffic. */
const DEFAULT_MODEL = 'gpt-4.1-mini';

// ── Agent construction ─────────────────────────────────────────────────────

/**
 * Build the chat agent. Public so the resume path can hand the same shape
 * to `restoreRunState` — the SDK requires the agent that originally
 * produced the state for deserialization.
 *
 * Optional `integrationTools` carry the Composio-loaded SDK tools for
 * whichever third-party apps the realtor has connected. Loaded dynamically
 * by `loadIntegrationTools` below; passed in here so this function stays
 * synchronous and pure for the resume path.
 */
export function buildChatAgent(
  ctx: ToolContext,
  opts: { model?: string; integrationTools?: SdkTool[] } = {},
): Agent {
  const domainTools = ALL_TOOLS.map((t: ToolDefinition) => toSdkTool(t, ctx));

  // Sub-agent skills attached as tools via the SDK's native `Agent.asTool()`.
  const pipelineAnalyst = buildPipelineAnalystAgent(ctx, { model: opts.model });
  const contactResearcher = buildContactResearcherAgent(ctx, { model: opts.model });

  const skillTools = [
    pipelineAnalyst.asTool({
      toolName: 'analyze_pipeline',
      toolDescription:
        'Analyze the pipeline for stuck deals, quiet hot persons, and overdue follow-ups.',
    }),
    contactResearcher.asTool({
      toolName: 'research_person',
      toolDescription:
        'Research everything we know about a person and recommend the next action.',
    }),
  ];

  return new Agent({
    name: 'Chippi',
    instructions: buildSystemPrompt(ctx),
    tools: [...domainTools, ...skillTools, ...(opts.integrationTools ?? [])],
    model: opts.model ?? DEFAULT_MODEL,
  });
}

/**
 * Resolve the Composio tools the realtor's chat should see this turn.
 * Loaded fresh per request — connect/disconnect changes take effect on
 * the next message without any cache invalidation.
 *
 * Failure mode: if Composio is unconfigured, unreachable, or returns an
 * error, we log and proceed WITHOUT integration tools. The chat keeps
 * working on its native catalog. Hard-fail would mean a Composio outage
 * takes down all chat — wrong tradeoff.
 */
export async function loadIntegrationTools(ctx: ToolContext): Promise<SdkTool[]> {
  if (!composioConfigured()) return [];
  try {
    const toolkits = await activeToolkits({ spaceId: ctx.space.id, userId: ctx.userId });
    if (toolkits.length === 0) return [];
    const tools = await loadToolsForEntity({ entityId: ctx.userId, toolkits });
    return tools as unknown as SdkTool[];
  } catch (err) {
    logger.warn(
      '[sdk-chat] integration tools load failed — proceeding without them',
      { spaceId: ctx.space.id, userId: ctx.userId, err: err instanceof Error ? err.message : String(err) },
    );
    return [];
  }
}

// ── Fresh-turn entry point ─────────────────────────────────────────────────

export interface RunChatTurnInput {
  ctx: ToolContext;
  /**
   * The user's new message. Plain string — we let the SDK fold it into the
   * conversation history with whatever session callback we configure
   * (default: append after history).
   */
  userMessage: string;
  /**
   * Optional override for the model (tests, A/B). The default
   * `gpt-4.1-mini` matches the bridge.
   */
  model?: string;
}

/**
 * Start a fresh agent turn. Returns the SDK's streamed result so the
 * caller can iterate `result.toStream()` for events and await
 * `result.completed` to know when persistence is safe.
 */
export async function runChatTurn(input: RunChatTurnInput) {
  const integrationTools = await loadIntegrationTools(input.ctx);
  const agent = buildChatAgent(input.ctx, { model: input.model, integrationTools });
  const result = await run(agent, input.userMessage, {
    stream: true,
    signal: input.ctx.signal,
  });
  return { result, agent };
}

// ── Resume entry point ─────────────────────────────────────────────────────

export interface ResumeChatTurnInput {
  ctx: ToolContext;
  /** Serialized RunState from `AgentPausedRun.runState`. */
  serializedState: string;
  /** The realtor's decision for the pending approval. */
  decision: ApprovalDecision;
  /**
   * The SDK approval-item identifier we apply the decision to. The chat
   * route reads this from `AgentPausedRun.approvals[].callId` (or accepts
   * it on the resume request body for a multi-pending scenario).
   */
  callId: string;
  model?: string;
}

/**
 * Restore a paused run, apply the approval decision, and resume streaming.
 * Mirrors the fresh-turn return shape so the route can pump events the
 * same way regardless of which path produced them.
 */
export async function resumeChatTurn(input: ResumeChatTurnInput) {
  const integrationTools = await loadIntegrationTools(input.ctx);
  const agent = buildChatAgent(input.ctx, { model: input.model, integrationTools });
  const state = await restoreRunState(agent, input.serializedState);

  // Find the matching approval item on the rehydrated state. The SDK
  // exposes pending approvals via `state.getInterruptions()` in newer
  // versions, but to stay compatible we extract from a typed run helper
  // — which the bridge handles via `applyApprovalDecision`.
  const item = findInterruption(state, input.callId);
  if (!item) {
    throw new Error(`No pending approval matching callId=${input.callId}`);
  }
  applyApprovalDecision(state, item, input.decision);

  const result = await run(agent, state, {
    stream: true,
    signal: input.ctx.signal,
  });
  return { result, agent };
}

// ── Internals ──────────────────────────────────────────────────────────────

/**
 * Fish the matching approval item out of a rehydrated RunState. The SDK's
 * RunState exposes a `_currentStep` / interruptions accessor that varies
 * subtly across versions; we try the documented public surface first
 * (`getInterruptions()`), then fall back to scanning known internal arrays.
 *
 * If neither path finds anything, we return undefined and the caller
 * surfaces a clear error — this is the only failure mode a stale
 * approval ID can produce, and we'd rather fail loud than silently
 * resume without applying the decision.
 */
function findInterruption(
  state: RunState<unknown, Agent<unknown, 'text'>>,
  callId: string,
): Parameters<RunState<unknown, Agent<unknown, 'text'>>['approve']>[0] | undefined {
  const anyState = state as unknown as {
    getInterruptions?: () => Array<{ rawItem?: { callId?: string; id?: string } }>;
    _currentStep?: { interruptions?: Array<{ rawItem?: { callId?: string; id?: string } }> };
  };

  let pool: Array<{ rawItem?: { callId?: string; id?: string } }> = [];
  if (typeof anyState.getInterruptions === 'function') {
    pool = anyState.getInterruptions() ?? [];
  } else if (anyState._currentStep?.interruptions) {
    pool = anyState._currentStep.interruptions ?? [];
  }
  const found = pool.find((it) => {
    const id = it.rawItem?.callId ?? it.rawItem?.id;
    return id === callId;
  });
  return found as
    | Parameters<RunState<unknown, Agent<unknown, 'text'>>['approve']>[0]
    | undefined;
}
