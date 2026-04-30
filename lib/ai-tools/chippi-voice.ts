/**
 * Chippi-voiced helpers for the chat path.
 *
 *   - computeConversationTitle: a 4-6 word sidebar title from the user's first
 *     message. Pure heuristic, no LLM call. ~90% good, cheap, no surprises.
 *
 *   - chippiErrorMessage: maps an error code to a first-person Chippi line so
 *     a tool failure or backend hiccup reads like Chippi talking, not like a
 *     stack trace leaking through.
 *
 * Both are sync, side-effect free, server- and client-safe (used in both).
 */

const TITLE_LEADING_FILLER = [
  // Greetings
  'hi',
  'hey',
  'hello',
  'yo',
  'sup',
  // Acknowledgements
  'ok',
  'okay',
  'thanks',
  'thx',
  // Politeness
  'please',
  'pls',
  // Modal openers
  'can you',
  'could you',
  'would you',
  'will you',
  'i need',
  'i want',
  'i would like',
  "i'd like",
  'i want to',
  'i need to',
  'help me',
  "let's",
  'lets',
];

/**
 * Generate a 4-6 word title from the user's first message.
 *
 * Strategy:
 *   1. Strip HTML, control chars, mention prefix from chippi-workspace.
 *   2. Drop leading conversational filler ("hi", "can you", "please", ...).
 *   3. Take the first 4-6 words; capitalize the first letter; strip trailing
 *      `?` `.` `!`; cap at 50 chars.
 *
 * Returns "New conversation" only as a last-ditch fallback — empty input
 * shouldn't reach here in practice (the route validates), but be defensive.
 */
export function computeConversationTitle(userMessage: string): string {
  let text = (userMessage ?? '').toString();

  // Strip the "(Referencing: [Contact: Name], ...)\n\n" prefix the workspace
  // injects when the user @-mentions an entity. The prefix is structural noise
  // for a sidebar title.
  text = text.replace(/^\(Referencing:[^)]*\)\s*/i, '');

  // Strip HTML and control chars; collapse whitespace.
  text = text
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 'New conversation';

  // Drop leading filler — match longest first so "can you" beats "can".
  const lower = text.toLowerCase();
  const sortedFiller = [...TITLE_LEADING_FILLER].sort((a, b) => b.length - a.length);
  for (const phrase of sortedFiller) {
    if (lower.startsWith(phrase + ' ') || lower === phrase) {
      text = text.slice(phrase.length).trim();
      // Loop again: "hi can you ..." should drop both.
      return computeConversationTitle(text);
    }
  }

  // Take first 4-6 words. We pick 6 unless the result would exceed 50 chars,
  // in which case we trim down word-by-word.
  const words = text.split(' ').filter(Boolean);
  if (words.length === 0) return 'New conversation';

  let title = words.slice(0, 6).join(' ');
  while (title.length > 50 && title.includes(' ')) {
    title = title.slice(0, title.lastIndexOf(' '));
  }
  // If a single word is itself >50 chars, hard-truncate.
  if (title.length > 50) title = title.slice(0, 50);

  // Strip trailing punctuation.
  title = title.replace(/[?.!,;:]+$/g, '').trim();

  if (!title) return 'New conversation';

  // Capitalize first letter; preserve the rest of the user's casing so proper
  // nouns ("Sarah", "Manhattan") don't get flattened.
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * Error codes the chat path can raise. Wider than the wire-level ErrorEvent
 * `code` enum on purpose — we use this to pick a friendly message before
 * shipping it across the wire.
 */
export type ChippiErrorCode =
  | 'cold_start'
  | 'tool_failure'
  | 'budget_exhausted'
  | 'guardrail'
  | 'network'
  | 'rate_limited'
  | 'auth'
  | 'internal';

/**
 * The single source of truth for what Chippi says when something goes wrong.
 * First-person, in-character, no system-warning vocabulary.
 */
export function chippiErrorMessage(code: ChippiErrorCode): string {
  switch (code) {
    case 'cold_start':
      return "Give me a second — I'm warming up the workshop.";
    case 'tool_failure':
      return "That tool's slow today — give me a moment.";
    case 'budget_exhausted':
      return "I burned through my budget on that one. Take a break and ask again — I'll be sharper.";
    case 'guardrail':
      return "That's not something I can help with directly — but if you re-frame it I'll try again.";
    case 'network':
      return "I'm offline at the moment — refresh once you're back online.";
    case 'rate_limited':
      return "You've been moving fast — give me a minute to catch up, then try again.";
    case 'auth':
      return "I lost track of who you are — refresh the page and I'll be right here.";
    case 'internal':
    default:
      return 'Something tripped me up. Try again — I usually do better the second time.';
  }
}

/**
 * Best-effort classification of a raw error message into a ChippiErrorCode.
 * Used at points where we only have a string (e.g. a fetch reject reason)
 * and need to pick the right Chippi line.
 */
export function classifyError(raw: string | undefined | null): ChippiErrorCode {
  const s = (raw ?? '').toLowerCase();
  if (!s) return 'internal';
  if (s.includes('rate limit') || s.includes('too many')) return 'rate_limited';
  if (s.includes('budget') || s.includes('quota') || s.includes('token')) return 'budget_exhausted';
  if (s.includes('guardrail') || s.includes('refused') || s.includes('policy')) return 'guardrail';
  if (
    s.includes('network') ||
    s.includes('fetch failed') ||
    s.includes('econnreset') ||
    s.includes('failed to fetch') ||
    s.includes('unreachable')
  ) {
    return 'network';
  }
  if (s.includes('unauthorized') || s.includes('forbidden') || s.includes('auth')) return 'auth';
  if (s.includes('tool') && (s.includes('failed') || s.includes('error'))) return 'tool_failure';
  return 'internal';
}
