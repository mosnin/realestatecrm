/**
 * Voice samples — what the realtor actually wrote, post-edit.
 *
 * The compose path used to read like a template because the model only ever
 * saw the SYSTEM_PROMPT and the subject's facts. After a realtor edits a
 * draft, the corrected body is the closest thing we have to ground truth on
 * how *they* sound. This helper pulls the last few of those edits so the
 * compose route can paste them in as a style reference.
 *
 * What we're NOT doing: storing a per-realtor "voice profile," running a
 * fine-tune, or building a vector index. The realtor's last 3 edited drafts
 * is the simplest thing that could possibly work; if it's not enough we'll
 * know from the next batch of edit_distance numbers.
 *
 * --- The PII-leak failure mode ----------------------------------------------
 * Sample bodies contain the names of OTHER subjects ("Hi Sam," "— Jane").
 * Pasted naively into a compose call for a different recipient, the model
 * could splice "Sam" into the new email. That would kill the feature.
 *
 * Defense in depth, in order:
 *   1. Server prompt instruction: "use as style reference, do NOT copy the
 *      content." (added by the caller, not this helper).
 *   2. This helper scrubs greeting names ("Hi Sam," → "Hi [name],") and
 *      closing names on a known-signature line ("- Sam" / "— Sam" / "Sam"
 *      on the last short line) before returning.
 *   3. Truncation at 400 chars, sentence-boundary-aware, so we don't return
 *      a half-sentence the model would "complete" with a hallucinated name.
 *
 * The tests assert the scrub on representative shapes. It's not exhaustive
 * — a realtor who writes "Sam, I think you'll love it" mid-paragraph still
 * leaks "Sam" — but the dominant failure modes (greeting + sign-off) are
 * covered, and the prompt instruction handles the residual.
 */

import { supabase } from '@/lib/supabase';

export interface VoiceSample {
  subject: string | null;
  body: string;
}

// ── Tunables ────────────────────────────────────────────────────────────────
//
// EDIT_DISTANCE_THRESHOLD = 12. The PATCH path stores a normalized-Levenshtein
// distance — whitespace already collapsed. 12 char-edits in a 200-400 char
// email is roughly "rewrote a phrase" or "swapped 3-4 words"; below that, the
// edit is usually a greeting tweak ("Hi" → "Hey") plus a typo, which doesn't
// teach voice. Tune up if signal-to-noise is bad once we have data.
//
// MIN_SAMPLES = 2. One outlier sample skews the model harder than zero
// samples does. Require two before we ship any. If the realtor has only
// edited once in 60 days, they're effectively still on the default voice.
//
// MAX_SAMPLES = 3. Three is enough for the model to triangulate cadence; more
// inflates prompt size with diminishing return.
//
// LOOKBACK_DAYS = 60. Any older than that and the realtor's voice has
// probably moved on (or the team has). Bounded query, bounded staleness.
//
// SAMPLE_MAX_CHARS = 400. Email bodies that long are fine to truncate — the
// model needs cadence, not a full transcript. We truncate at a sentence
// boundary when one exists in the last quarter, otherwise hard-cut and add
// an ellipsis. Half-sentences invite hallucinated completions.
const EDIT_DISTANCE_THRESHOLD = 12;
const MIN_SAMPLES = 2;
const MAX_SAMPLES = 3;
const LOOKBACK_DAYS = 60;
const SAMPLE_MAX_CHARS = 400;

// ── Cache (same shape as lib/ai-tools/context-enrichment.ts) ────────────────
//
// 5-minute TTL keyed by spaceId. The voice samples don't change often (the
// realtor edits maybe a handful per day), and the compose route fires
// repeatedly during a single dashboard session. Cheap memoization.
//
// Per-space, never global — voice never bleeds across tenants.
interface CacheEntry {
  samples: VoiceSample[];
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/** Test-only: drop every memoized entry. Production code must not call this. */
export function __resetDraftVoiceCacheForTests(): void {
  cache.clear();
}

// ── PII scrub ───────────────────────────────────────────────────────────────
//
// Replace the greeting name and the closing signature name with a generic
// placeholder. These two slots are where >90% of recipient-specific PII
// lives in a short email. We don't try to NER the middle of the body — that
// requires a model and would defeat the point of a thin helper.
function scrubBody(raw: string): string {
  let s = raw;

  // Greeting: "Hi Sam," / "Hello Sam," / "Hey Sam," / "Hi Sam." at the
  // start (optionally after whitespace). Capture the punctuation so we put
  // it back. \p{L} for any Unicode letter; cap at 30 chars to avoid eating
  // a sentence.
  s = s.replace(
    /^(\s*(?:Hi|Hello|Hey|Dear)\s+)([\p{L}][\p{L}\p{M}'’\-]{0,29})(\s*[,.!])/u,
    '$1[name]$3',
  );

  // Closing signature: a short line at the end that's just a name (and
  // optional leading dash/em-dash). We treat the LAST non-empty line as
  // the candidate; if it's < 30 chars, has at most 3 words, and contains
  // no terminal punctuation, replace it.
  const lines = s.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    const stripped = trimmed.replace(/^[-—–\s]+/, '').trim();
    const looksLikeName =
      stripped.length > 0 &&
      stripped.length <= 30 &&
      stripped.split(/\s+/).length <= 3 &&
      !/[.!?:;,]/.test(stripped) &&
      /^[\p{L}][\p{L}\p{M}'’\-\s]*$/u.test(stripped);
    if (looksLikeName) {
      lines[i] = lines[i].replace(stripped, '[realtor]');
    }
    break;
  }
  return lines.join('\n');
}

// ── Truncation ──────────────────────────────────────────────────────────────
//
// Cut at SAMPLE_MAX_CHARS. If there's a sentence end (`.`, `!`, `?`) in the
// last quarter of the truncated window, cut there to avoid mid-sentence
// stops; otherwise hard-cut and append an ellipsis so the boundary is
// visible to the model and to a debugging human.
function truncateSample(raw: string): string {
  if (raw.length <= SAMPLE_MAX_CHARS) return raw;
  const window = raw.slice(0, SAMPLE_MAX_CHARS);
  const minBoundary = Math.floor(SAMPLE_MAX_CHARS * 0.75);
  let cut = -1;
  for (let i = window.length - 1; i >= minBoundary; i--) {
    const ch = window[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      cut = i + 1;
      break;
    }
  }
  if (cut > 0) return window.slice(0, cut).trim();
  return window.trim() + '…';
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getRecentVoiceSamples(
  spaceId: string,
  opts: { now?: Date } = {},
): Promise<VoiceSample[]> {
  const now = opts.now ?? new Date();

  const cached = cache.get(spaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.samples;
  }

  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString();

  // SELECT only the two columns we return — explicitly NOT contactId/dealId,
  // not subject-of-deal title, not anything that could leak who the prior
  // draft was for. Defense at the query layer.
  const { data, error } = await supabase
    .from('AgentDraft')
    .select('subject, content')
    .eq('spaceId', spaceId)
    .eq('channel', 'email')
    .eq('feedback_action', 'edited_and_approved')
    .in('status', ['sent', 'approved'])
    .gt('edit_distance', EDIT_DISTANCE_THRESHOLD)
    .gte('updatedAt', cutoff)
    .order('updatedAt', { ascending: false })
    .limit(MAX_SAMPLES);

  if (error || !data) {
    // Fail closed — no voice rather than a broken voice. Cache the empty
    // result so a transient DB hiccup doesn't hammer us; TTL is 5 min.
    cache.set(spaceId, { samples: [], expiresAt: Date.now() + TTL_MS });
    return [];
  }

  const rows = data as Array<{ subject: string | null; content: string }>;

  // MIN_SAMPLES gate: 1 sample is worse than 0 (overfits to one outlier).
  if (rows.length < MIN_SAMPLES) {
    cache.set(spaceId, { samples: [], expiresAt: Date.now() + TTL_MS });
    return [];
  }

  const samples: VoiceSample[] = rows.map((r) => ({
    subject: r.subject,
    body: truncateSample(scrubBody(r.content ?? '')),
  }));

  cache.set(spaceId, { samples, expiresAt: Date.now() + TTL_MS });
  return samples;
}
