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
import { isWorkspaceRunContinuationIntent } from '@/lib/chippi/workspace-run-intent';
import type { ToolDefinition } from './types';
import { isWorkbenchEnabled } from '@/lib/chippi/workbench-flag';
import { isResearchWorkspaceIntent } from '@/lib/chippi/research-workspace-intent';

/**
 * Always loaded. The verbs that answer the everyday turn: find/list a person
 * or deal, glance at the pipeline, leave a note, set a follow-up, recall
 * history, read an attachment. Drafting is intentionally intent-gated: a
 * draft tool must never compete with a real send on an explicit send turn.
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
    'analyze_property_values',
    'add_property',
    'update_property_status',
    'delete_property',
    'note_on_property',
  ],
  calendar: ['check_availability', 'block_time', 'propose_tour_times'],
  drafting: ['draft_email', 'draft_sms'],
  comms: ['send_email', 'send_sms', 'send_property_packet', 'log_email_sent', 'log_sms_sent'],
  automations: ['create_automation'],
  pipeline: ['workspace_stats', 'find_quiet_hot_persons', 'find_overdue_followups'],
  brokerage: ['summarize_realtor', 'analyze_realtor', 'assign_lead_to_realtor', 'request_deal_review'],
  files: ['list_files', 'read_file', 'attach_file_to_property', 'read_spreadsheet', 'summarize_document', 'open_spreadsheet_in_workbench', 'inspect_workbook', 'apply_workbook_transformation'],
  studio: ['generate_studio_image'],
  planning: ['create_plan'],

  // `control_browser` (single action) + `browser_task` (bounded multi-step
  // observe→act loop) — driving the realtor's own paired browser. Both were
  // added in the same change that introduces this 'browser' set and its
  // TOOLSET_PATTERNS entry below.
  //
  // FLAG for whoever owns tests/lib/ai-tools-toolsets.test.ts (not this
  // track's file — not edited here): that test's "every tool is reachable"
  // case drives getChatTools() with a FIXED keyword string ("person deal
  // tour property calendar send pipeline broker file plan") that predates
  // this set and has no browser-ish term in it, so control_browser +
  // browser_task will read as unreachable under that string until it grows
  // one (e.g. append "browser"). Previously control_browser dodged this by
  // being a registry ORPHAN (see orphanNames() below) — always loaded
  // regardless of keywords, which trivially passed that test at the cost of
  // shipping its schema on every single turn. Moving it into a real,
  // keyword-gated set is the actual token-furnace fix this file exists for
  // (see the file header); the test needing its fixture string updated is
  // the anticipated, intentional consequence, not a bug in this set.
  browser: ['control_browser', 'browser_task'],
};

/**
 * Standing / unattended work. Includes the words realtors actually say
 * ("autonomous follow-ups", "automatically") — not just "create a workflow".
 */
const AUTOMATION_INTENT =
  /\b(automation|automate|automatic(?:ally)?|autonomous(?:ly)?|workflow|every\s+time|whenever|on\s+autopilot)\b|\b(?:standing|recurring|ongoing)\s+follow[\s-]?ups?\b|\bfollow[\s-]?ups?\s+(?:on\s+)?(?:automatic(?:ally)?|autonomous(?:ly)?|auto|autopilot)\b/i;

/** Keyword → toolset. Over-inclusive by design; mirrors router.ts regex style. */
const TOOLSET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['people', /\b(person|people|contact|lead|buyer|seller|prospect|client|merge|archive|delete|remove|hot|cold|warm|follow|meeting|call|note)\b/i],
  ['deals', /\b(deal|stage|won|lost|clos(?:e|ing)|offer|checklist|value|price|probability|stuck|stalled|escrow|delete|remove)\b/i],
  ['tours', /\b(tour|showing|visit|walk-?through|open house|weather|forecast|rain|temperature|delete|remove)\b/i],
  ['properties', /\b(propert\w*|listing\w*|home|house|unit|comp|comparable|address|mls|delete|remove|area|neighbo\w*|zip|district|school\w*|walkab\w*|walk score|safety|crime|amenit\w*|market|commute)\b/i],
  ['calendar', /\b(calendar|availab\w*|book|slot|appointment|busy|free|block|agenda)\b/i],
  ['drafting', /\b(draft|compose|write(?:\s+me)?|prepare)\b[\s\S]{0,80}\b(email|text|sms|message|reply)\b/i],
  ['comms', /\b(send|email|sms|text|message|packet|reply|forward|reach|outreach|blast)\b/i],
  ['automations', AUTOMATION_INTENT],
  ['pipeline', /\b(pipeline|quiet|overdue|stuck|stalled|at[\s-]?risk|priority|leak|stats|statistics|numbers|metrics|kpis?|dashboard|snapshot|how am i doing|how'?s business)\b/i],
  ['brokerage', /\b(broker|team|realtor|agent|roster|assign|review|performance|production)\b/i],
  ['files', /\b(file|upload|document|attachment|pdf|photo|packet|spreadsheet|csv|tsv|xlsx?|excel|workbench|summarize|normaliz(?:e|ing|ation)|deduplicat(?:e|ing|ion)|remove\s+duplicate\s+rows?|trim(?:ming)?\s+whitespace|rename\s+(?:a\s+)?column|add\s+(?:a\s+)?(?:[a-z][\w -]{0,48}\s+)?column|tag\s+(?:every\s+)?(?:row|sheet)|phone\s+numbers?)\b/i],
  ['studio', /\b(?:generate|create|make|design)\b[\s\S]{0,70}\b(?:image|graphic|visual|flyer|social\s+post|listing\s+photo)\b|\b(?:image|graphic|visual|flyer|social\s+post)\b[\s\S]{0,50}\b(?:generate|create|make|design)\b/i],
  ['planning', /\b(plan|sweep|everyone|all (?:my|hot|the)|prepare me|batch)\b/i],
  [
    'browser',
    /\b(browser|browse|website|web ?page|webpage|\burl\b|navigate|zillow|redfin|trulia|realtor\.com|mls listing|log[\s-]?in to|fill (?:out|in) (?:a|the) form|search (?:the )?web|screenshot)\b/i,
  ],
];

const EXPLICIT_DRAFT_INTENT =
  /\b(draft|compose|write(?:\s+me)?|prepare)\b[\s\S]{0,80}\b(email|text|sms|message|reply)\b/i;
const EXPLICIT_SEND_INTENT =
  /\b(send|email(?:s|ed|ing)?|text(?:s|ed|ing)?|sms|reply|forward)\b|\bmessage(?:s|d|ing)?\s+(?:a|the|this|that|my|our|all|every|each|new|lead|client|contact|buyer|seller|prospect|them|him|her)\b/i;
const CONTACT_CREATION_INTENT =
  /\b(?:add|create|save|log)\s+(?:(?:a|the|this|new)\s+)?(?:contact|person|lead|buyer|seller|prospect|client)\b|\b(?:add|create|save)\b[\s\S]{0,40}\bas\s+(?:(?:a|the|new)\s+)?(?:contact|person|lead|buyer|seller|prospect|client)\b/i;
const DURABLE_WORK_INTENT =
  /\b(research|report|audit|deep[\s-]?dive|comprehensive|multi[\s-]?file|terminal|workspace|deliverable|downloadable|artifact|compare\s+(?:multiple|several|three|\d+)\s+(?:sites|sources|listings))\b/i;

/**
 * The current durable WorkSession engine publishes a private Markdown file.
 * It cannot truthfully promise PDF bytes. Keep explicit PDF creation/export
 * out of the execution catalog so the model must state the capability gap
 * instead of doing CRM reads and narrating a file that will never exist.
 * Reading or summarizing an uploaded PDF does not match this output intent.
 */
const PDF_DELIVERABLE_INTENT =
  /\b(?:create|make|generate|produce|build|prepare|export|convert|downloadable)\b[\s\S]{0,100}\bpdf\b|\bpdf\b[\s\S]{0,100}\b(?:create|make|generate|produce|build|prepare|export|convert|downloadable)\b/i;

export function isUnsupportedPdfDeliverableIntent(message: string): boolean {
  return PDF_DELIVERABLE_INTENT.test(message ?? '');
}

/**
 * Work mode executes mutations without the legacy approval pause. These
 * rules turn a concrete request into the mutating tools that may run
 * without another confirmation. Read-only tools remain available for
 * grounding. Sibling mutators stay in the catalog so a multi-step ask
 * ("email Sarah and schedule a tour") can still find every needed tool.
 *
 * Automation creation has priority: text such as "create an automation that
 * emails every new lead" describes the automation's behavior, not three
 * independent mutations (create contact + send email + create automation).
 */
const AUTOMATION_CREATION_INTENT =
  /\b(?:create|build|make|add|set[\s-]?up|configure|automate|enable|start)\b[\s\S]{0,80}\b(?:automation|workflow|autonomous(?:ly)?|automatic(?:ally)?)\b|\b(?:automation|workflow)\b[\s\S]{0,40}\b(?:create|build|make|add|set[\s-]?up|configure)\b|\b(?:autonomous(?:ly)?|automatic(?:ally)?)\s+follow[\s-]?ups?\b|\bfollow[\s-]?ups?\s+(?:on\s+)?(?:automatic(?:ally)?|autonomous(?:ly)?|auto|autopilot)\b|\b(?:automatically|autonomously)\b[\s\S]{0,50}\b(?:follow[\s-]?up|nurture|check[\s-]?in)\b|\b(?:can you|could you|are you able to|do you)\b[\s\S]{0,50}\b(?:autonomous(?:ly)?|automatic(?:ally)?|on\s+autopilot)\b|\b(?:work|run|operate|act)\s+autonomous(?:ly)?\b/i;
const PROPERTY_VALUE_ANALYSIS_INTENT =
  /\b(?:analy[sz]e|estimate|evaluate|valuation|cma)\b[\s\S]{0,90}\b(?:propert\w*|home|house|listing|address|value|price|comp(?:arable)?s?)\b|\b(?:property|home|house|listing)\s+(?:value|valuation|price|comps?)\b/i;
const EMAIL_SEND_INTENT =
  /\bsend\b[\s\S]{0,60}\b(?:an?\s+)?email\b|^\s*(?:please\s+)?email\s+(?!address(?:es)?\b)|\b(?:please|can\s+you|could\s+you|will\s+you|go\s+ahead\s+and)\s+email\s+(?!address(?:es)?\b)|\b(?:reply|forward)\b[\s\S]{0,60}\bemail\b/i;
const SMS_SEND_INTENT =
  /\bsend\b[\s\S]{0,60}\b(?:an?\s+)?(?:sms|text(?:\s+message)?)\b|^\s*(?:please\s+)?text\b|\b(?:please|can\s+you|could\s+you|will\s+you|go\s+ahead\s+and)\s+text\b/i;
const PROPERTY_PACKET_SEND_INTENT =
  /\bsend\b[\s\S]{0,60}\b(?:property|listing)\s+packet\b/i;
const IMAGE_GENERATION_INTENT =
  /\b(?:generate|create|make|design)\b[\s\S]{0,70}\b(?:image|graphic|visual|flyer|social\s+post|listing\s+photo)\b|\b(?:image|graphic|visual|flyer|social\s+post)\b[\s\S]{0,50}\b(?:generate|create|make|design)\b/i;
const EXPLICIT_BROWSER_CONTROL_INTENT =
  /\b(?:use|open|control|drive|navigate|browse|search|check|visit|go\s+to|fill(?:\s+out|\s+in)?)\b[\s\S]{0,80}\b(?:browser|website|web\s?page|url|zillow|redfin|trulia|realtor\.com)\b|\b(?:browser|website|web\s?page|url|zillow|redfin|trulia|realtor\.com)\b[\s\S]{0,50}\b(?:open|navigate|browse|search|check|visit|fill)\b/i;
const TOUR_SCHEDULE_INTENT =
  /\b(?:schedule|book|set[\s-]?up)\b[\s\S]{0,60}\b(?:tour|showing|visit|walk-?through|open house)\b/i;
const TOUR_RESCHEDULE_INTENT =
  /\breschedule\b[\s\S]{0,50}\b(?:tour|showing|visit|walk-?through|open house)\b/i;
const FOLLOWUP_SET_INTENT =
  /\b(?:set|create|add|schedule)\b[\s\S]{0,40}\bfollow[\s-]?up\b|\bremind\b[\s\S]{0,40}\b(?:me|them|him|her|to)\b/i;
const DEAL_CREATE_INTENT = /\b(?:create|add|open)\b[\s\S]{0,40}\bdeal\b/i;
const NOTE_INTENT = /\b(?:add|leave|log|write)\b[\s\S]{0,40}\bnote\b/i;
const LOG_CALL_INTENT = /\b(?:log|record)\b[\s\S]{0,40}\b(?:a\s+)?call\b/i;

/**
 * Follow-ups like "continue" or "do the next one" do not restate the Work
 * goal. Tool-set selection always unions the goal; direct-execution grants
 * only fall back to the goal for these continuation phrases so a new question
 * cannot inherit the previous mutation.
 */
const WORK_CONTINUATION_RE =
  /^(?:yes|yeah|yep|yup|ok|okay|sure|please(?:\s+do)?|do it|go ahead|continue|keep going|next|proceed|do the next(?: one)?|finish(?: it)?|keep at it)(?:[.!]|\s|$)/i;

/** Reads the Work prompt names every turn. Always load them in Work so the
 *  model is never told to call a tool that is not in this turn's list. */
const WORK_PROMPTED_READ_TOOLS: readonly string[] = [
  'analyze_property_values',
  'workspace_stats',
  'get_weather',
  'find_property',
  'find_tours',
];

export function isWorkContinuationMessage(message: string): boolean {
  return WORK_CONTINUATION_RE.test((message ?? '').trim());
}

function catalogSource(message: string, conversationGoal?: string): string {
  return [message ?? '', conversationGoal ?? ''].filter((part) => part.trim()).join('\n');
}

const DESTRUCTIVE_WORK_TOOL_NAMES = new Set<string>([
  'archive_person',
  'merge_persons',
  'delete_contact',
  'delete_deal',
  'cancel_tour',
  'delete_tour',
  'delete_property',
]);

const DESTRUCTIVE_WORK_INTENTS: ReadonlyArray<readonly [string, RegExp]> = [
  [
    'delete_contact',
    /\b(?:delete|permanently\s+remove)\b[\s\S]{0,50}\b(?:contact|person|lead|buyer|seller|prospect|client)\b/i,
  ],
  [
    'archive_person',
    /\barchive\b[\s\S]{0,50}\b(?:contact|person|lead|buyer|seller|prospect|client)\b/i,
  ],
  [
    'merge_persons',
    /\bmerge\b[\s\S]{0,60}\b(?:contacts?|people|persons?|leads?|buyers?|sellers?|prospects?|clients?)\b/i,
  ],
  ['delete_deal', /\b(?:delete|permanently\s+remove)\b[\s\S]{0,50}\bdeal\b/i],
  ['cancel_tour', /\bcancel\b[\s\S]{0,50}\b(?:tour|showing|visit|walk-?through)\b/i],
  [
    'delete_tour',
    /\b(?:delete|permanently\s+remove)\b[\s\S]{0,50}\b(?:tour|showing|visit|walk-?through)\b/i,
  ],
  [
    'delete_property',
    /\b(?:delete|permanently\s+remove)\b[\s\S]{0,50}\b(?:property|listing|home|house|unit)\b/i,
  ],
];

/**
 * Null means there is no single explicit mutation contract for this turn.
 * An empty set means the explicit request is read-only and therefore should
 * expose no mutator. A non-empty set is the direct-execution allowlist —
 * sibling mutators selected by keyword toolsets stay in the catalog.
 */
function selectWorkMutationScope(message: string): Set<string> | null {
  const text = message ?? '';

  if (AUTOMATION_CREATION_INTENT.test(text)) {
    return new Set(['create_automation']);
  }

  const allowed = new Set<string>();
  let scoped = false;

  if (CONTACT_CREATION_INTENT.test(text)) {
    scoped = true;
    allowed.add('add_person');
  }
  if (PROPERTY_VALUE_ANALYSIS_INTENT.test(text)) {
    scoped = true;
  }
  if (!EXPLICIT_DRAFT_INTENT.test(text) && EXPLICIT_SEND_INTENT.test(text)) {
    if (EMAIL_SEND_INTENT.test(text)) {
      scoped = true;
      allowed.add('send_email');
    }
    if (SMS_SEND_INTENT.test(text)) {
      scoped = true;
      allowed.add('send_sms');
    }
    if (PROPERTY_PACKET_SEND_INTENT.test(text)) {
      scoped = true;
      allowed.add('send_property_packet');
    }
  }
  if (EXPLICIT_BROWSER_CONTROL_INTENT.test(text)) {
    scoped = true;
    allowed.add('control_browser');
    allowed.add('browser_task');
  }
  if (IMAGE_GENERATION_INTENT.test(text)) {
    scoped = true;
    allowed.add('generate_studio_image');
  }
  if (TOUR_SCHEDULE_INTENT.test(text)) {
    scoped = true;
    allowed.add('schedule_tour');
  }
  if (TOUR_RESCHEDULE_INTENT.test(text)) {
    scoped = true;
    allowed.add('reschedule_tour');
  }
  if (FOLLOWUP_SET_INTENT.test(text)) {
    scoped = true;
    allowed.add('set_followup');
  }
  if (DEAL_CREATE_INTENT.test(text)) {
    scoped = true;
    allowed.add('create_deal');
  }
  if (NOTE_INTENT.test(text)) {
    scoped = true;
    allowed.add('note_on_person');
    allowed.add('note_on_deal');
    allowed.add('note_on_property');
  }
  if (LOG_CALL_INTENT.test(text)) {
    scoped = true;
    allowed.add('log_call');
  }

  for (const [toolName, pattern] of DESTRUCTIVE_WORK_INTENTS) {
    if (!pattern.test(text)) continue;
    scoped = true;
    allowed.add(toolName);
  }

  return scoped ? allowed : null;
}

/**
 * Exact mutators that may execute directly for this message. The intersection
 * with the already-selected catalog prevents an intent regex from granting a
 * capability that was not actually exposed to the agent on this turn.
 */
function selectWorkMutationScopeForTurn(
  message: string,
  conversationGoal?: string,
): Set<string> | null {
  const messageScope = selectWorkMutationScope(message);
  if (!conversationGoal || !isWorkContinuationMessage(message)) {
    return messageScope;
  }
  const goalScope = selectWorkMutationScope(conversationGoal);
  if (!messageScope && !goalScope) return null;
  return new Set<string>([...(messageScope ?? []), ...(goalScope ?? [])]);
}

export function selectDirectExecutionToolNames(
  message: string,
  selectedTools: readonly ToolDefinition[],
  conversationGoal?: string,
): string[] {
  const mutationScope = selectWorkMutationScopeForTurn(message, conversationGoal);
  if (!mutationScope) return [];
  return selectedTools
    .filter(
      (tool) => tool.requiresApproval !== false && mutationScope.has(tool.name),
    )
    .map((tool) => tool.name);
}

/** Tools not assigned to CORE or any TOOLSET — always loaded so nothing is lost. */
function orphanNames(): string[] {
  const assigned = new Set<string>([...CORE_TOOL_NAMES]);
  for (const names of Object.values(TOOLSETS)) for (const n of names) assigned.add(n);
  // Capability-gated tools must never become unconditional catalog orphans.
  return ALL_TOOLS.map((t) => t.name).filter(
    (n) => !assigned.has(n) && n !== 'continue_workspace_run' && n !== 'start_work_session',
  );
}

/** Toolset names a message implies. Empty when only core is needed. */
export function selectToolsets(message: string): string[] {
  const text = message ?? '';
  const selected = new Set<string>();
  for (const [name, re] of TOOLSET_PATTERNS) {
    if (re.test(text)) selected.add(name);
  }
  // Keep tool exposure and the TS-native route on the same natural-language
  // contract. The route still requires the server-side feature/tenant gate;
  // selecting this existing browser toolset alone never enables cloud work.
  if (isResearchWorkspaceIntent(text)) selected.add('browser');
  return [...selected];
}

/**
 * The domain tools to hand the chat agent for THIS message: CORE + any
 * implied toolsets + orphans. A subset of ALL_TOOLS, deduped, order-preserved.
 */
export function getChatTools(
  message: string,
  capabilities: {
    workspaceContinuationEligible?: boolean;
    workMode?: boolean;
    conversationGoal?: string;
  } = {},
): ToolDefinition[] {
  const wanted = new Set<string>([...CORE_TOOL_NAMES, ...orphanNames()]);
  for (const ts of selectToolsets(catalogSource(message, capabilities.conversationGoal))) {
    for (const n of TOOLSETS[ts] ?? []) wanted.add(n);
  }

  const text = message ?? '';
  const isDraftRequest = EXPLICIT_DRAFT_INTENT.test(text);
  const isSendRequest = !isDraftRequest && EXPLICIT_SEND_INTENT.test(text);
  const isAutomationRequest = AUTOMATION_INTENT.test(text);
  const isContactCreation = CONTACT_CREATION_INTENT.test(text);
  const isImageGeneration = IMAGE_GENERATION_INTENT.test(text);
  const isUnsupportedPdfDeliverable = isUnsupportedPdfDeliverableIntent(text);

  // Intent is enforced in the catalog, not left to model preference. Explicit
  // drafting and sending are mutually exclusive, while automation creation
  // cannot fall through to a one-off message tool.
  if (isDraftRequest) {
    wanted.delete('send_email');
    wanted.delete('send_sms');
    wanted.delete('send_property_packet');
  }
  if (isSendRequest || isContactCreation) {
    wanted.delete('draft_email');
    wanted.delete('draft_sms');
  }
  if (isAutomationRequest) {
    wanted.delete('draft_email');
    wanted.delete('draft_sms');
    wanted.delete('send_email');
    wanted.delete('send_sms');
    wanted.delete('send_property_packet');
    wanted.delete('add_person');
    // One-off CRM reminder dates compete with standing automations on the
    // same "follow-up" wording. Keep set_followup off this turn.
    wanted.delete('set_followup');
    wanted.delete('clear_followup');
  }

  if (capabilities.workMode) {
    // Work can begin as a quick action and grow into a multi-step turn after
    // the first lookup. Keep the small, side-effect-free planning schema
    // available for every Work turn so the prompt can require a real PlanCard
    // before genuinely multi-step execution without relying on brittle words
    // such as "plan" or "batch" in the user's request.
    wanted.add('create_plan');
    for (const toolName of WORK_PROMPTED_READ_TOOLS) wanted.add(toolName);

    // A plan for an artifact format the runtime cannot produce is misleading
    // activity, not progress. sdk-chat.ts also fixes tool_choice to `none` for
    // this exact intent, making the capability response deterministic.
    if (isUnsupportedPdfDeliverable) wanted.delete('create_plan');

    const mutationScope = selectWorkMutationScopeForTurn(
      text,
      capabilities.conversationGoal,
    );

    // Destructive tools are never incidental Work-mode siblings. They enter
    // the catalog only when the user explicitly names that destructive verb
    // and entity (for example, "delete the contact").
    for (const toolName of DESTRUCTIVE_WORK_TOOL_NAMES) {
      if (!mutationScope?.has(toolName)) wanted.delete(toolName);
    }

    // An empty scope is an explicit read-only contract (valuation, CMA).
    // A non-empty scope is the direct-execution allowlist only — do not
    // delete sibling mutators the keyword toolsets already selected. Stripping
    // them made multi-step Work ("email Sarah and schedule a tour") and
    // goal follow-ups report that those tools did not exist.
    if (mutationScope) {
      if (mutationScope.size === 0) {
        for (const tool of ALL_TOOLS) {
          if (tool.requiresApproval !== false) wanted.delete(tool.name);
        }
      }
      for (const toolName of mutationScope) wanted.add(toolName);
    }
  }

  if (capabilities.workspaceContinuationEligible && isWorkspaceRunContinuationIntent(message)) wanted.add('continue_workspace_run');
  const isSimpleMutation = isSendRequest || isAutomationRequest || isContactCreation || isImageGeneration;
  if (
    capabilities.workMode
    && !isSimpleMutation
    && !isUnsupportedPdfDeliverable
    && DURABLE_WORK_INTENT.test(text)
  ) {
    wanted.add('start_work_session');
  }
  return ALL_TOOLS.filter((t) => wanted.has(t.name) && (!['open_spreadsheet_in_workbench', 'inspect_workbook', 'apply_workbook_transformation'].includes(t.name) || isWorkbenchEnabled()));
}
