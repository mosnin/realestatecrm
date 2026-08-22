/**
 * Parse the small JSON contract returned by the WorkSession planner.
 *
 * OpenRouter (and a few compatible models) can occasionally ignore the
 * `json_object` hint and wrap an otherwise valid object in prose or a
 * markdown code fence.  Keep that tolerance at this boundary only: callers
 * still receive a validated object, and arbitrary prose is never promoted to
 * a plan.
 */

export interface PlannerPayload {
  steps: unknown[];
  question?: unknown;
}

/**
 * Return balanced JSON object candidates from text, respecting quoted braces.
 * We intentionally scan every opening brace so explanatory prose before the
 * real object does not make a valid response unreadable.
 */
function balancedObjects(text: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{') depth++;
      if (char === '}') {
        depth--;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          break;
        }
        if (depth < 0) break;
      }
    }
  }

  return candidates;
}

function jsonCandidates(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];

  const candidates = [text];
  const fences = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  for (const match of text.matchAll(fences)) {
    const body = match[1]?.trim();
    if (body) candidates.push(body);
  }
  candidates.push(...balancedObjects(text));
  for (const match of text.matchAll(fences)) {
    if (match[1]) candidates.push(...balancedObjects(match[1]));
  }

  return [...new Set(candidates)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parse a planner completion.  A null result means the provider did not
 * return a JSON object at all; a non-null result can still contain zero valid
 * steps, which lets the engine report the more precise "couldn't build"
 * failure after its bounded corrective retry.
 */
export function parsePlannerOutput(raw: string): PlannerPayload | null {
  for (const candidate of jsonCandidates(raw)) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!isRecord(decoded)) continue;
    // A nested object from a truncated/irrelevant response is not a planner
    // payload. Require at least one contract key before accepting it.
    if (!('steps' in decoded) && !('question' in decoded)) continue;

    return {
      steps: Array.isArray(decoded.steps) ? decoded.steps : [],
      question: decoded.question,
    };
  }
  return null;
}

/** Whether a decoded payload contains enough usable content to stop retrying. */
export function hasUsablePlannerContent(payload: PlannerPayload): boolean {
  const hasStep = payload.steps.some((step) => {
    if (step === null || typeof step !== 'object' || Array.isArray(step)) return false;
    const title = (step as { title?: unknown }).title;
    return typeof title === 'string' && title.trim().length > 0;
  });
  const question = payload.question;
  const hasQuestion = typeof question === 'string'
    && question.trim().length > 0
    && question.trim().toLowerCase() !== 'null';
  return hasStep || hasQuestion;
}

/** Keep planner spend bounded: one corrective completion after the first. */
export const MAX_PLANNER_ATTEMPTS = 2;

export const PLANNER_RETRY_PROMPT =
  'The previous response was not a usable planner object. Return ONLY valid JSON with this exact shape: {"steps":[{"title":"..."}],"question":null}. Include 3-6 concrete step titles unless one clarifying question is genuinely required.';
