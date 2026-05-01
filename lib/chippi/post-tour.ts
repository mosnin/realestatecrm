/**
 * Post-tour orchestration helpers.
 *
 * Given a transcript like "Sam loved it, wants to make an offer at 1.1M,
 * follow up Friday, his wife was worried about the school district", we
 * ask the model to propose 2-5 actions the realtor would have taken
 * manually. The model does NOT execute the tools — it returns intent
 * only. The realtor approves the batch in one tap; the route then runs
 * each tool serially via the existing `executeTool` pipeline.
 *
 * Why option (b) (JSON inference) over (a) (SDK interrupt loop):
 *  - The agent SDK approve-flow only pauses on `requiresApproval: true`.
 *    Read-only tools like `find_person` and `draft_email` would just run
 *    against the live workspace, which is the wrong contract for a
 *    realtor who wants to review before anything happens.
 *  - One round trip vs. many. Faster, cheaper, easier to reason about.
 *  - The output is trivially capped, sorted, and de-duplicated server-side.
 *
 * If the model returns 0 actions or invalid JSON, the route surfaces a
 * calm empty state. If the model goes wild and returns 10 actions, we
 * truncate to 5. Either failure mode is the model's fault; the realtor
 * sees a clean surface either way.
 */

import { z } from 'zod';
import type OpenAI from 'openai';
import type { ToolDefinition } from '@/lib/ai-tools/types';
import { getTool } from '@/lib/ai-tools/registry';

/** Cap on actions returned to the UI. The stack must fit on one screen. */
export const MAX_PROPOSALS = 5;

/** Subset of tools the orchestrator is allowed to propose post-tour. The
 *  full 42-tool registry is too noisy for a 30-second debrief — most of
 *  these are administrative or aggregate queries the realtor would never
 *  trigger from a tour recap. The seven below cover the actual moments:
 *  log it, mark it, schedule the next thing, draft the message. */
export const POST_TOUR_TOOL_ALLOWLIST = [
  'log_call',
  'log_meeting',
  'note_on_person',
  'note_on_deal',
  'mark_person_hot',
  'mark_person_cold',
  'set_followup',
  'draft_email',
  'draft_sms',
] as const;

export type PostTourToolName = (typeof POST_TOUR_TOOL_ALLOWLIST)[number];

/** What the model is asked to return. */
const ProposalSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).default({}),
});

const OrchestratorOutputSchema = z.object({
  proposals: z.array(ProposalSchema).default([]),
});

export interface ProposedAction {
  tool: PostTourToolName;
  args: Record<string, unknown>;
  /** Human-readable line — the row label in the approval stack. */
  summary: string;
  /** Whether this verb mutates state (i.e. needs the realtor's yes). */
  mutates: boolean;
}

export interface ContextHint {
  personId?: string;
  dealId?: string;
}

/** System prompt fed to the orchestrator. Short on purpose — the model
 *  has the tool list as structured input; we don't pad with examples. */
export function buildSystemPrompt(allowedTools: readonly ToolDefinition[]): string {
  const catalog = allowedTools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
  return [
    "You are Chippi's post-tour orchestrator.",
    'A realtor just finished a property tour and dictated a debrief.',
    'Propose 2-5 actions they would otherwise do manually.',
    '',
    'Rules:',
    '- Do NOT execute anything. Return intent only.',
    '- Use only tools from this list:',
    catalog,
    '',
    '- Each proposal must be one tool name plus the args you would call it with.',
    '- If the realtor mentions a name (e.g. "Sam") and you have a personId from context, use it. If not, leave personId as the realtor\'s phrasing — the route will resolve it.',
    '- Prefer concrete dates ("Friday") over vague ones ("soon"). Use ISO 8601 when set_followup needs a date.',
    '- Skip any action you can\'t justify from the transcript.',
    '',
    'Output JSON: { "proposals": [ { "tool": "<name>", "args": { ... } }, ... ] }',
  ].join('\n');
}

/** Given the model's raw output, produce sanitized ProposedActions. The
 *  function is intentionally pure — it does no DB reads — so unit tests
 *  cover the whole shaping layer without mocking. */
export function shapeProposals(
  raw: unknown,
  opts: { allowlist?: readonly string[] } = {},
): ProposedAction[] {
  const allow = new Set(opts.allowlist ?? POST_TOUR_TOOL_ALLOWLIST);
  const parsed = OrchestratorOutputSchema.safeParse(raw);
  if (!parsed.success) return [];

  const out: ProposedAction[] = [];
  const seen = new Set<string>();

  for (const item of parsed.data.proposals) {
    if (!allow.has(item.tool)) continue;
    const def = getTool(item.tool);
    if (!def) continue;

    // De-dupe identical (tool, args) pairs — the model occasionally
    // proposes the same action twice when the transcript mentions
    // something twice.
    const key = `${item.tool}::${stableStringify(item.args)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let summary: string;
    try {
      summary = def.summariseCall
        ? (def.summariseCall as (a: unknown) => string)(item.args)
        : `Run ${item.tool}`;
    } catch {
      summary = `Run ${item.tool}`;
    }

    out.push({
      tool: item.tool as PostTourToolName,
      args: item.args,
      summary,
      mutates: def.requiresApproval !== false,
    });

    if (out.length >= MAX_PROPOSALS) break;
  }

  return out;
}

/** JSON.stringify with sorted keys — needed for de-dup to work across
 *  different model output orders. Tiny, correct for our shapes. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Run the orchestrator. Returns the shaped proposals.
 *  - Throws on transport / API failure (route maps to 500).
 *  - Returns [] for empty / malformed model output.
 *  Caller is responsible for the auth and rate-limit gates. */
export async function proposeActions(
  openai: OpenAI,
  input: { transcript: string; contextHint?: ContextHint; tools: ToolDefinition[]; model?: string },
): Promise<ProposedAction[]> {
  const transcript = input.transcript.trim();
  if (!transcript) return [];

  const allowed = input.tools.filter((t) =>
    (POST_TOUR_TOOL_ALLOWLIST as readonly string[]).includes(t.name),
  );

  const userPayload: Record<string, unknown> = { transcript };
  if (input.contextHint?.personId) userPayload.personId = input.contextHint.personId;
  if (input.contextHint?.dealId) userPayload.dealId = input.contextHint.dealId;

  const completion = await openai.chat.completions.create({
    model: input.model ?? 'gpt-4.1-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(allowed) },
      { role: 'user', content: JSON.stringify(userPayload) },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim() ?? '';
  if (!text) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  return shapeProposals(raw);
}
