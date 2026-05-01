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
import type { SupabaseClient } from '@supabase/supabase-js';
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
  /** Chippi-voice line that uses the resolved Contact/Deal name instead of
   *  an ID slug. Set server-side after a batched lookup. The UI prefers
   *  this over `summary` whenever it's present. Absent only on the rare
   *  miss (id outside the workspace, or model returned no id). */
  humanSummary?: string;
  /** Whether this verb mutates state (i.e. needs the realtor's yes). */
  mutates: boolean;
}

export interface ContextHint {
  personId?: string;
  dealId?: string;
}

/** System prompt fed to the orchestrator. Tight contract, no manifesto. */
export function buildSystemPrompt(allowedTools: readonly ToolDefinition[]): string {
  const catalog = allowedTools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
  return [
    'Turn a realtor\'s post-tour debrief into 2-5 proposed actions. Return intent only — never execute.',
    '',
    'Allowed tools:',
    catalog,
    '',
    'Rules:',
    '- Use a personId/dealId only when the user payload contains one. If not, drop the action.',
    '- Use ISO 8601 for set_followup.when. Concrete weekday phrases ("friday", "next tuesday") are also accepted.',
    '- Skip any action the transcript doesn\'t justify.',
    '',
    'Output JSON: { "proposals": [ { "tool": "<name>", "args": { ... } } ] }',
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

// ── humanSummary resolution ───────────────────────────────────────────────

/**
 * Walk proposals, batch-read the Contacts and Deals they reference, and
 * write a Chippi-voice `humanSummary` onto each one. Names replace ID
 * slugs. At most ONE Contact query and ONE Deal query per request — the
 * orchestrator stack is capped at 5 actions, the lookups are tiny.
 *
 * The post-tour ceremony is the bid-for-10 surface; chat-side approval
 * prompts and the draft inbox have a different bar and continue to use
 * each tool's `summariseCall`. That's why this helper lives here, not
 * on the tool definitions — it's a per-surface elevation.
 */
export async function attachHumanSummaries(
  supabase: SupabaseClient,
  spaceId: string,
  proposals: ProposedAction[],
): Promise<ProposedAction[]> {
  if (proposals.length === 0) return proposals;

  const personIds = collectStringIds(proposals, 'personId');
  const dealIds = collectStringIds(proposals, 'dealId');

  const [personMap, dealMap] = await Promise.all([
    personIds.size > 0 ? readNames(supabase, 'Contact', 'name', spaceId, personIds) : Promise.resolve(new Map<string, string>()),
    dealIds.size > 0 ? readNames(supabase, 'Deal', 'title', spaceId, dealIds) : Promise.resolve(new Map<string, string>()),
  ]);

  return proposals.map((p) => {
    const human = formatHumanSummary(p, personMap, dealMap);
    return human ? { ...p, humanSummary: human } : p;
  });
}

function collectStringIds(proposals: ProposedAction[], key: 'personId' | 'dealId'): Set<string> {
  const out = new Set<string>();
  for (const p of proposals) {
    const v = p.args[key];
    if (typeof v === 'string' && v.length > 0) out.add(v);
  }
  return out;
}

async function readNames(
  supabase: SupabaseClient,
  table: 'Contact' | 'Deal',
  nameCol: 'name' | 'title',
  spaceId: string,
  ids: Set<string>,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from(table)
    .select(`id, ${nameCol}`)
    .eq('spaceId', spaceId)
    .in('id', Array.from(ids));
  const map = new Map<string, string>();
  for (const row of (data as Array<Record<string, unknown>> | null) ?? []) {
    const id = row.id;
    const name = row[nameCol];
    if (typeof id === 'string' && typeof name === 'string' && name.trim()) {
      map.set(id, name.trim());
    }
  }
  return map;
}

/** Per-verb format. Returns null when we can't do better than the fallback
 *  (no resolved name for the id the action references). */
export function formatHumanSummary(
  proposal: ProposedAction,
  people: Map<string, string>,
  deals: Map<string, string>,
): string | null {
  const a = proposal.args as Record<string, unknown>;
  const personName = typeof a.personId === 'string' ? people.get(a.personId) : undefined;
  const dealName = typeof a.dealId === 'string' ? deals.get(a.dealId) : undefined;

  switch (proposal.tool) {
    case 'log_call': {
      if (!personName) return null;
      const note = trimQuote(a.summary);
      return note ? `Log ${personName}'s call: "${note}"` : `Log ${personName}'s call`;
    }
    case 'log_meeting': {
      if (!personName) return null;
      const note = trimQuote(a.summary);
      const where = typeof a.location === 'string' && a.location.trim() ? ` at ${a.location.trim()}` : '';
      return note ? `Log ${personName}'s meeting${where}: "${note}"` : `Log ${personName}'s meeting${where}`;
    }
    case 'note_on_person': {
      if (!personName) return null;
      const content = trimQuote(a.content);
      return content ? `Note on ${personName}: "${content}"` : `Note on ${personName}`;
    }
    case 'note_on_deal': {
      if (!dealName) return null;
      const content = trimQuote(a.content);
      return content ? `Note on ${dealName}: "${content}"` : `Note on ${dealName}`;
    }
    case 'mark_person_hot': {
      if (!personName) return null;
      const why = trimReason(a.why);
      return why ? `Mark ${personName} hot — ${why}` : `Mark ${personName} hot`;
    }
    case 'mark_person_cold': {
      if (!personName) return null;
      const why = trimReason(a.why);
      return why ? `Mark ${personName} cold — ${why}` : `Mark ${personName} cold`;
    }
    case 'set_followup': {
      if (!personName) return null;
      const when = typeof a.when === 'string' ? prettifyWhen(a.when) : '';
      return when ? `Follow up with ${personName} on ${when}` : `Follow up with ${personName}`;
    }
    case 'draft_email': {
      if (!personName) return null;
      const intent = describeIntent(a.intent);
      return `Draft a ${intent} email to ${personName}`;
    }
    case 'draft_sms': {
      if (!personName) return null;
      const intent = describeIntent(a.intent);
      return `Draft a ${intent} text to ${personName}`;
    }
    default:
      return null;
  }
}

function trimQuote(v: unknown, max = 80): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function trimReason(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\.+$/, '');
  if (!t) return null;
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
}

function describeIntent(v: unknown): string {
  if (typeof v !== 'string') return 'check-in';
  switch (v) {
    case 'check-in': return 'check-in';
    case 'log-call': return 'follow-up';
    case 'welcome': return 'welcome';
    case 'reach-out': return 'reach-out';
    default: return 'check-in';
  }
}

/** Render an ISO date or weekday phrase as a clean human string ("Friday",
 *  "May 8"). Falls back to the raw string. Pure — no Date.now leakage. */
export function prettifyWhen(when: string, now: Date = new Date()): string {
  const raw = when.trim();
  if (!raw) return '';

  // ISO date
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return raw;
    const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
    const opts: Intl.DateTimeFormatOptions = sameYear
      ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
      : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat('en-US', opts).format(d);
  }

  // weekday phrase — capitalise first letter of each word
  return raw
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}
