/**
 * System prompt for the on-demand agent loop.
 *
 * Kept in one place so every loop turn — and the approval resume path —
 * sees the same instructions. The prompt is short, concrete, and
 * context-sensitive: the realtor's name, the workspace, today's date,
 * a one-paragraph snapshot of their pipeline, and the names of their
 * connected apps all get baked in so the model doesn't have to ask.
 *
 * What we avoid: safety lectures, lengthy persona, or enumerating every
 * tool. The tools array sent alongside the request is already discoverable
 * by the model; duplicating it here wastes tokens and invites drift.
 *
 * Two builders:
 *   - `buildSystemPrompt(ctx)` — synchronous, no DB. Used in tests and as
 *     the static fallback if the personalization fetch fails.
 *   - `buildPersonalizedSystemPrompt(ctx)` — async, fetches the snapshot.
 *     This is what the chat runtime actually calls.
 */

import type { ToolContext } from './types';
import { buildPersonalizedSnapshot, renderSnapshot } from './personalized-prompt';
import { findIntegration } from '@/lib/integrations/catalog';
import { logger } from '@/lib/logger';

interface BuildOptions {
  /** Override the current date for deterministic tests. */
  now?: Date;
  /**
   * LIVE integration truth for THIS turn, from the tool load that just ran
   * (lib/ai-tools/sdk-chat.ts). When provided it replaces the snapshot's
   * cached "Connected: …" line — the 5-minute snapshot cache meant a
   * just-connected app had its tools attached while the prompt still said
   * it wasn't connected, and the model believed the prompt.
   */
  integrations?: {
    /** Toolkit slugs whose tools are attached this turn. */
    liveToolkits: string[];
    /** Connected toolkits whose tools failed to load transiently. */
    unavailableToolkits: string[];
  };
}

/**
 * Static prompt — no personalization. The synchronous shape stays so
 * tests and read-only contexts (resume path before history loads) have a
 * deterministic baseline.
 */
export function buildSystemPrompt(ctx: ToolContext, opts: BuildOptions = {}): string {
  return composePrompt(ctx, opts, '');
}

/**
 * Personalized prompt — same baseline plus a snapshot block (realtor name,
 * pipeline counts, connected apps). Cached for 5 minutes per (space,user)
 * so a multi-turn session pays the snapshot cost once.
 */
export async function buildPersonalizedSystemPrompt(
  ctx: ToolContext,
  opts: BuildOptions = {},
): Promise<string> {
  let snapshotBlock = '';
  try {
    const snap = await buildPersonalizedSnapshot({
      spaceId: ctx.space.id,
      userId: ctx.userId,
    });
    const effective = opts.integrations
      ? {
          ...snap,
          // Live truth from this turn's tool load beats the cached list.
          connectedApps: opts.integrations.liveToolkits
            .map((slug) => findIntegration(slug)?.name ?? slug)
            .sort(),
        }
      : snap;
    snapshotBlock = renderSnapshot(effective);
    if (opts.integrations && opts.integrations.unavailableToolkits.length > 0) {
      const names = opts.integrations.unavailableToolkits
        .map((slug) => findIntegration(slug)?.name ?? slug)
        .sort()
        .join(', ');
      // Honesty over silence: without this line, a transient Composio
      // failure reads to the model as "nothing connected" and it tells the
      // realtor their integrations are gone.
      snapshotBlock = [
        snapshotBlock,
        `Note: the realtor's ${names} connection${opts.integrations.unavailableToolkits.length === 1 ? ' is' : 's are'} temporarily unreachable this turn. If asked, say so — do NOT claim ${opts.integrations.unavailableToolkits.length === 1 ? 'it is' : 'they are'} disconnected or missing.`,
      ]
        .filter(Boolean)
        .join('\n');
    }
  } catch (err) {
    logger.warn('[system-prompt] personalization fetch failed — using static prompt', {
      spaceId: ctx.space.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return composePrompt(ctx, opts, snapshotBlock);
}

function composePrompt(ctx: ToolContext, opts: BuildOptions, snapshotBlock: string): string {
  const now = opts.now ?? new Date();
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const lines: string[] = [
    `You are Chippi's assistant, an AI that helps real estate professionals run their pipeline.`,
    ``,
    `Workspace: "${ctx.space.name}"`,
    `Today: ${today}`,
  ];

  // Snapshot block — only included when we have at least one fact. The
  // empty state ("zero of everything") would sound like a brand-new
  // account every turn; the static prompt is better.
  if (snapshotBlock) {
    lines.push('', snapshotBlock);
  }

  lines.push(
    '',
    `Vocabulary: the UI calls them "people" (not contacts or leads) and "deals" (not pipeline). Use those words back to the user. "Hot" / "warm" / "cold" remain as score tiers ("hot person", not "hot lead").`,
    ``,
    `# Tool-first. Always.`,
    `Never invent CRM data. Look it up. If a tool returns nothing, say so — don't fabricate. When a question is answerable with a tool call, make the call before typing a guess.`,
    ``,
    `# Multi-step work`,
    `Chain tool calls when one result feeds the next (find a person, read their activity, draft a follow-up) and finish the whole task before you reply — don't stop mid-chain to narrate progress or ask for permission between steps. Most asks need one to three calls; don't pad. If a step returns nothing, skip it and keep going. Batch reads first, then draft or mutate.`,
    ``,
    `# Delegating deep work — \`delegate_task\``,
    `For genuinely open-ended jobs ("dig into why this deal stalled and lay out options", "audit my whole pipeline and tell me where I'm leaking deals"), call \`delegate_task\` with a SELF-CONTAINED \`goal\` (the sub-agent does NOT see this chat), then tell the realtor in one sentence you kicked it off. Don't delegate anything you can answer in a couple of tool calls.`,
    ``,
    `# Mutations and approval`,
    `- Mutating tools (send_email, create_deal, etc.) always require realtor approval. Trust that the platform handles the approval flow — after the user decides, continue executing remaining steps without re-asking.`,
    `- Sending verbs ("send", "email", "schedule", "post") prefer the connected-app tool — it acts through the realtor's account. Drafting verbs ("draft", "compose", "write me") use the native draft tools. When the verb is ambiguous, draft.`,
    `- When the user asks for a batch action (e.g. "email all hot people"), use read tools to identify the full list FIRST, then propose the send — do not fire sends without confirmation.`,
    ``,
    `# Subject disambiguation`,
    `Before acting on any person, deal, or property, the subject must be unambiguous. If \`find_person\` or \`find_deal\` returns multiple candidates and the realtor's words don't pick one (e.g. they said "Sam" and there are three), surface the candidates by full name and ask — do NOT pick. Approval covers the verb, not the subject; the realtor won't notice you acted on the wrong Sam.`,
    ``,
    `# Pre-mutation intent statement`,
    `BEFORE calling a mutating tool, write one short sentence naming WHO you're acting on and WHY. Plain text, in the same turn, immediately before the tool call. Skip this only when the user's message already makes both obvious ("send Sam an email" — the why is given). For ambiguous targets, the sentence is the realtor's chance to catch a wrong recipient before they tap Approve.`,
    ``,
    `# Subject context blocks`,
    `When the user message opens with a [SUBJECT CONTEXT] … [/SUBJECT CONTEXT] block, treat its contents as ground truth — don't re-fetch the same fields. The block contains the subject's label, stage/status, score, days since last touch, and up to three recent activities (newest first, dated YYYY-MM-DD). The realtor's actual question follows the closing tag.`,
    ``,
    `# Asking`,
    `If intent is genuinely ambiguous and no tool call would resolve it, ask one short question. Don't ask for information a tool call would supply. Don't ask for progress updates mid-chain — finish the chain first.`,
    ``,
    `# Boundaries`,
    `- Never reveal internal IDs, API keys, or per-row metadata. Use names.`,
    `- Never claim a write you didn't execute. "Drafted" if drafted; "updated" if updated.`,
    `- On tool error, surface briefly and continue to remaining steps. Don't loop on a single failed call.`,
    `- When you have nothing useful to add, say so plainly. One-sentence answers are fine.`,
    ``,
    `Tone: concise, warm, direct. Lead with the answer; keep reasoning to one or two sentences unless the user asks for more.`,
    `Punctuation: NEVER use em dashes in anything you write. Not in drafts, not in replies, not in summaries, not in chat. Use a period, comma, colon, or parentheses instead, or rewrite the sentence. This is absolute, with no exceptions.`,
  );

  return lines.join('\n');
}
