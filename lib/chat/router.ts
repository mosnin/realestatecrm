/**
 * Keep tool access stable across phrasing, attachments and follow-up turns.
 * Only an explicitly self-contained greeting uses the toolless shortcut.
 * Everything else reaches the tool-capable runtime, which can answer without
 * calling a tool when none is needed. Unknown intent must not remove access.
 */

/**
 * Imperative action verbs that signal the realtor wants Chippi to DO
 * something (mutation, send, schedule) — not just answer. Case insensitive,
 * matched as standalone words. Order doesn't matter; the alternation is
 * treated as a flat set.
 *
 * Curated from real chat traffic, not a thesaurus:
 *   - CRUD: add, create, set, update, change, edit, archive, mark, log, save
 *   - Comms: send, text, email, reply, forward, draft, write, ping, dm
 *   - Reach-out variants: reach, contact, follow, follow-up, nudge, call
 *   - Schedule: schedule, book, set up, set-up, cancel, reschedule, move
 *   - Workflow: assign, route, qualify, advance, close, win, lose
 *   - Other: remind (when imperative: "remind me", "remind her")
 *
 * Not on the list: review, look, find, search, get, show, tell, list, what,
 * how, why, who, when are absent from this legacy verb catalog.
 * Routing no longer depends on the catalog; workspace reads keep tool access.
 */
const ACTION_VERBS_RE =
  /\b(add|create|set|update|change|edit|archive|mark|log|save|delete|remove|send|text|sms|email|reply|forward|draft|write|ping|dm|reach|contact|follow|followup|nudge|call|schedule|book|cancel|reschedule|move|assign|reassign|unassign|route|qualify|advance|close|win|lose|remind|notify|fire|ship|invite|approve|reject|connect|disconnect|link|integrate|sync)\b/i;

export type RouteDecision = 'direct' | 'agent';

export interface RouteAttachment {
  id?: string;
  mimeType?: string;
}

export function decideRoute(
  userMessage: string,
  attachments: RouteAttachment[] = [],
): RouteDecision {
  const text = (userMessage ?? '').trim();
  if (attachments.length > 0) return 'agent';
  if (!text || /^(?:hi(?: there)?|hello(?: there)?|hey(?: there)?|thanks|thank you)[!.\s]*$/i.test(text)) return 'direct';
  return 'agent';
}

/** Broker conversations use the same capability-preserving routing rule. */
export function decideBrokerRoute(
  userMessage: string,
  attachments: RouteAttachment[] = [],
): RouteDecision {
  return decideRoute(userMessage, attachments);
}

// ── Escalation detection ────────────────────────────────────────────────────
//
// After the direct path produces a reply, we scan it for tells that the
// model wanted to take action but had no tools. Heuristic — not a classifier
// — and that's the point: shipping a fast escape valve beats designing a
// perfect escalation pipeline. Iterate later.

const ESCALATION_PHRASES = [
  // Direct admissions
  /\bi (?:can'?t|cannot|won'?t be able to) (?:do that|do this|run|send|schedule|create|add|update|book)\b/i,
  /\bi'd need to actually\b/i,
  /\bi would need to actually\b/i,
  /\bi'll need to (?:actually )?(?:create|add|send|run|schedule|book|update|reach|contact|email|text|call|draft)\b/i,
  /\blet me (?:actually )?(?:create|add|send|run|schedule|book|update|reach|contact|email|text|draft) (?:that|this|it|him|her|them)\b/i,
  // "Need a moment to look that up" — the EXACT phrasing the direct-path
  // lite prompt instructs the model to use for action turns
  // (CHIPPI_INSTRUCTIONS_LITE: "just say you'll need a moment to look that
  // up and do it"). Previously unmatched, so a model obeying its own prompt
  // promised action, escalated nothing, and the action never happened.
  /\b(?:i(?:'ll| will)?|i'?d) (?:just )?need a moment to (?:look|pull|check|dig|get|grab)\b/i,
  /\bgive me a (?:moment|minute|sec(?:ond)?) (?:to|while i) (?:look|pull|check|dig|get|grab)\b/i,
  // Hand-off language
  /\blet me (?:hand|pass) (?:this|that) (?:to|over to) (?:chippi'?s? tools|the agent|chippi)\b/i,
  /\bi(?:'ll| will) hand (?:this|that) (?:to|over to)\b/i,
  // Plain refusals tied to action
  /\bi can'?t (?:actually )?(?:run|send|fire|execute|trigger|invoke)\b/i,
  /\bi don'?t have (?:access to|the ability to|tools to) (?:run|send|create|do)\b/i,
  // "I don't have access to any tools / your CRM / your data" — the exact phrasing
  // the direct-path model uses when asked a workspace question it can't answer.
  // Previously unmatched; model would commit the deflection instead of escalating.
  /\bi don'?t have (?:access to |the ability to access )?(?:any )?(?:tools?|your (?:crm|contacts?|deals?|workspace|data|pipeline|calendar)|the (?:crm|workspace|tool))\b/i,
  /\bi (?:can'?t|cannot) (?:access|look up|query|retrieve|fetch|read) (?:your|the) (?:crm|contacts?|deals?|workspace|data|pipeline|calendar|leads?)\b/i,
  /\bthis (?:is (?:the )?)?(?:fast q&a|q&a|chat|direct) (?:surface|path|mode)\b.*(?:can'?t|cannot|don'?t|no)\b/i,
  /\b(?:no|don'?t have) (?:access to|tools to|ability to) (?:look up|query|read|fetch|check)\b/i,
];

/**
 * Should this direct-path reply trigger an automatic escalation to the
 * agent path? Pure function — no I/O. Caller decides what to do with the
 * answer (re-route, toast, log).
 *
 * Returns false on empty/whitespace input. The agent path itself has the
 * tools to actually do the action, so a re-run there will either succeed
 * or surface a meaningful "I can't" reply with the real reason.
 */
export function shouldEscalate(directResponse: string): boolean {
  const text = (directResponse ?? '').trim();
  if (!text) return false;
  for (const re of ESCALATION_PHRASES) {
    if (re.test(text)) return true;
  }
  return false;
}

// Compatibility export for callers that classify action wording. This catalog
// does not decide whether a conversation can access tools.
export const ACTION_VERBS_REGEX = ACTION_VERBS_RE;
