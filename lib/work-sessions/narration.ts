/**
 * Work-session narration + mid-run replanning — pure helpers, exhaustively
 * unit-testable, shared by the engine.
 *
 * humanizeToolCall: turns a tool call into the one live line the strip shows
 * under the running step ("Searching contacts…"), so a background run reads
 * as a colleague working, not a batch job.
 *
 * parseNewSteps: the replanning contract. A step agent that discovers work
 * mid-run ends its answer with `NEW_STEP: <title>` lines; the engine appends
 * them to the plan (bounded) and strips them from the stored finding.
 */

/** Friendly lines for the common tools; anything else gets the fallback. */
const NARRATION: Record<string, string> = {
  find_person: 'Looking up a contact…',
  list_contacts: 'Going through the contact book…',
  find_deal: 'Pulling up deals…',
  find_property: 'Pulling up properties…',
  find_tours: 'Checking the tour schedule…',
  research_area: 'Researching the area…',
  find_comparable_properties: 'Finding comparable properties…',
  list_plugins: 'Checking available plugins…',
  read_session_report: 'Reading an earlier report…',
  stage_message_draft: 'Writing a draft…',
};

export function humanizeToolCall(toolName: string): string {
  const known = NARRATION[toolName];
  if (known) return known;
  // fallback: "get_contact_activity" → "Get contact activity…"
  const words = toolName.replace(/_/g, ' ').trim();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}…`;
}

const NEW_STEP_RE = /^\s*NEW_STEP:\s*(.+?)\s*$/gm;

export interface ParsedFinding {
  /** The finding with NEW_STEP lines removed. */
  text: string;
  /** Titles of steps the agent asked to add, in order, deduped, capped. */
  newSteps: string[];
}

/**
 * Extract NEW_STEP directives from a step finding. `maxNew` bounds how many
 * this single finding may add (the engine additionally bounds total plan
 * size). Directive lines are removed from the stored text either way — a
 * clipped directive must not leak into the report as literal "NEW_STEP:".
 */
export function parseNewSteps(finding: string, maxNew = 2): ParsedFinding {
  const newSteps: string[] = [];
  const seen = new Set<string>();
  for (const match of finding.matchAll(NEW_STEP_RE)) {
    const title = match[1].trim().slice(0, 120);
    const key = title.toLowerCase();
    if (title && !seen.has(key)) {
      seen.add(key);
      if (newSteps.length < maxNew) newSteps.push(title);
    }
  }
  const text = finding.replace(NEW_STEP_RE, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, newSteps };
}
