/**
 * Per-turn tool selection — the token-furnace fix.
 *
 * THE PROBLEM: the chat agent was built with the ENTIRE tool catalog
 * (`ALL_TOOLS`) on every turn. The SDK re-ships every tool's JSON schema on
 * every inner step, so a one-lookup question ("who are my leads") paid for
 * ~50 tool schemas it never used, multiplied across the turn loop. That is
 * the bulk of the per-turn token cost.
 *
 * THE FIX (proportionality, not deletion): keep a small CORE set always
 * loaded — the verbs that answer the common 80% of turns — and load the long
 * tail only when the message implies it. No tool is removed; the catalog can
 * grow without growing the per-turn footprint. This is the same on-demand
 * pattern the Composio integration tools already use, applied to the native
 * catalog.
 *
 * Selection is keyword-based (same lightweight approach as `lib/chat/router.ts`),
 * deliberately OVER-inclusive: a missed toolset is worse than an extra one, so
 * patterns err toward loading a set. Anything not assigned to a toolset is an
 * "orphan" and is always loaded, so a new tool can never become unreachable by
 * being forgotten here.
 *
 * Resume (approval) turns do NOT use this — they rebuild with the full catalog
 * (a safe superset of whatever the paused run referenced). That path is rare,
 * so re-shipping the catalog there is an acceptable trade for zero regression
 * risk on the approval flow.
 */

import { ALL_TOOLS } from './tools';
import type { ToolDefinition } from './types';

/**
 * Always loaded. The verbs that answer the everyday turn: find/list a person
 * or deal, glance at the pipeline, draft a message, leave a note, set a
 * follow-up, recall history, read an attachment. ~12 schemas instead of ~50.
 */
export const CORE_TOOL_NAMES: readonly string[] = [
  'find_person',
  'list_contacts',
  'note_on_person',
  'set_followup',
  'log_call',
  'find_deal',
  'note_on_deal',
  'pipeline_summary',
  'draft_email',
  'draft_sms',
  'recall_history',
  'read_attachment',
];

/**
 * Loaded only when the message implies them. Grouped by the realtor's mental
 * model, not the file layout. Every non-core tool belongs to exactly one set
 * (the coverage test enforces this).
 */
export const TOOLSETS: Record<string, readonly string[]> = {
  people: [
    'add_person',
    'log_meeting',
    'clear_followup',
    'mark_person_hot',
    'mark_person_cold',
    'archive_person',
    'delete_contact',
    'merge_persons',
  ],
  deals: [
    'create_deal',
    'move_deal_stage',
    'update_deal_value',
    'update_deal_close_date',
    'update_deal_probability',
    'attach_property_to_deal',
    'mark_deal_won',
    'mark_deal_lost',
    'delete_deal',
    'add_checklist_item',
    'find_stuck_deals',
    'draft_offer',
    'draft_counter_offer',
    'draft_contingency',
  ],
  tours: ['schedule_tour', 'reschedule_tour', 'cancel_tour', 'delete_tour', 'find_tours', 'get_weather'],
  properties: [
    'find_property',
    'research_area',
    'find_comparable_properties',
    'add_property',
    'update_property_status',
    'delete_property',
    'note_on_property',
  ],
  calendar: ['check_availability', 'block_time', 'propose_tour_times'],
  comms: ['send_email', 'send_sms', 'send_property_packet', 'log_email_sent', 'log_sms_sent'],
  pipeline: ['workspace_stats', 'find_quiet_hot_persons', 'find_overdue_followups'],
  brokerage: ['summarize_realtor', 'analyze_realtor', 'assign_lead_to_realtor', 'request_deal_review'],
  files: ['list_files', 'read_file', 'attach_file_to_property', 'read_spreadsheet', 'summarize_document'],
  planning: ['create_plan'],
};

/** Keyword → toolset. Over-inclusive by design; mirrors router.ts regex style. */
const TOOLSET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['people', /\b(person|people|contact|lead|buyer|seller|prospect|client|merge|archive|delete|remove|hot|cold|warm|follow|meeting|call|note)\b/i],
  ['deals', /\b(deal|stage|won|lost|clos(?:e|ing)|offer|checklist|value|price|probability|stuck|stalled|escrow|delete|remove)\b/i],
  ['tours', /\b(tour|showing|visit|walk-?through|open house|weather|forecast|rain|temperature|delete|remove)\b/i],
  ['properties', /\b(propert\w*|listing\w*|home|house|unit|comp|comparable|address|mls|delete|remove|area|neighbo\w*|zip|district|school\w*|walkab\w*|walk score|safety|crime|amenit\w*|market|commute)\b/i],
  ['calendar', /\b(calendar|availab\w*|book|slot|appointment|busy|free|block|agenda)\b/i],
  ['comms', /\b(send|email|sms|text|message|packet|reply|forward|reach|outreach|blast)\b/i],
  ['pipeline', /\b(pipeline|quiet|overdue|stuck|stalled|at[\s-]?risk|priority|leak|stats|statistics|numbers|metrics|kpis?|dashboard|snapshot|how am i doing|how'?s business)\b/i],
  ['brokerage', /\b(broker|team|realtor|agent|roster|assign|review|performance|production)\b/i],
  ['files', /\b(file|upload|document|attachment|pdf|photo|packet|spreadsheet|csv|tsv|xlsx?|excel|summarize)\b/i],
  ['planning', /\b(plan|sweep|everyone|all (?:my|hot|the)|prepare me|batch)\b/i],
];

/** Tools not assigned to CORE or any TOOLSET — always loaded so nothing is lost. */
function orphanNames(): string[] {
  const assigned = new Set<string>([...CORE_TOOL_NAMES]);
  for (const names of Object.values(TOOLSETS)) for (const n of names) assigned.add(n);
  return ALL_TOOLS.map((t) => t.name).filter((n) => !assigned.has(n));
}

/** Toolset names a message implies. Empty when only core is needed. */
export function selectToolsets(message: string): string[] {
  const text = message ?? '';
  const selected = new Set<string>();
  for (const [name, re] of TOOLSET_PATTERNS) {
    if (re.test(text)) selected.add(name);
  }
  return [...selected];
}

/**
 * The domain tools to hand the chat agent for THIS message: CORE + any
 * implied toolsets + orphans. A subset of ALL_TOOLS, deduped, order-preserved.
 */
export function getChatTools(message: string): ToolDefinition[] {
  const wanted = new Set<string>([...CORE_TOOL_NAMES, ...orphanNames()]);
  for (const ts of selectToolsets(message)) {
    for (const n of TOOLSETS[ts] ?? []) wanted.add(n);
  }
  return ALL_TOOLS.filter((t) => wanted.has(t.name));
}
