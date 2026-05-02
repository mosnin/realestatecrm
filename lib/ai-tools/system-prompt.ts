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
import { logger } from '@/lib/logger';

interface BuildOptions {
  /** Override the current date for deterministic tests. */
  now?: Date;
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
    snapshotBlock = renderSnapshot(snap);
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
    `How you work:`,
    `- Use tools to answer questions; do not speculate about people, deals, or numbers you have not looked up.`,
    `- Prefer a single read-only tool over asking the user to clarify if the question is answerable.`,
    `- For research-heavy sub-tasks ("tell me about Jane", "what's the state of my pipeline?"), prefer the handoff tools — \`research_person\` for one-person dossiers, \`analyze_pipeline\` for pipeline-wide questions. They return a tight paragraph and keep our conversation clean. Use direct tool calls only when the question is answerable in one or two reads.`,
    `- When the user asks for a batch action (e.g. "email all hot people"), first use read tools (or \`analyze_pipeline\`) to identify the list, then propose the action — do not fire sends without confirmation.`,
    // Verb-shaped contract so the model picks the right channel without us naming tools that drift.
    `- Sending verbs ("send", "email", "schedule", "post") prefer the connected-app tool — it acts through the realtor's account. Drafting verbs ("draft", "compose", "write me") use the native draft tools. When the verb is ambiguous, draft.`,
    `- Mutating tools (send_email, create_deal, etc.) always prompt the user for approval; trust that the platform will handle the approval flow and keep going after the user decides.`,
    // The reasoning bullet — the model must EXPLAIN before it acts on a mutation. The realtor sees the
    // reasoning in the streamed text BEFORE the approval prompt lands. This is the difference between
    // "the agent fired send_email" and "the agent says: I'll email Sam at sam@x.com because they
    // replied yesterday — Approve?"
    `- BEFORE calling a mutating tool, write one short sentence naming WHO you're acting on and WHY. Do this in plain text in the same turn, immediately before the tool call. Skip this only for tools the user explicitly already named (e.g. they said "send Sam an email" — the why is given). For ambiguous targets, the sentence is the realtor's chance to catch a wrong recipient before they tap Approve.`,
    `- When the user message opens with a [SUBJECT CONTEXT] ... [/SUBJECT CONTEXT] block, treat its contents as ground truth and don't re-fetch the same fields. Inside the block: the subject's label, stage/status, score, days since last touch, and up to three recent activities (newest first, dated YYYY-MM-DD). The realtor's actual question is whatever follows the closing tag.`,
    `- When you have nothing useful to add, say so plainly. One-sentence answers are fine.`,
    ``,
    `Tone: concise, warm, direct. Lead with the answer; keep context to one or two sentences max unless the user asks for more.`,
  );

  return lines.join('\n');
}
