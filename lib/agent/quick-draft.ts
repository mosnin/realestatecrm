/**
 * Quick-draft compose engine — the shared OpenAI call that powers BOTH:
 *
 *   • POST /api/agent/quick-draft (preview mode) — the /chippi home's
 *     inline draft engine, the realtor's "Send a check-in" tap.
 *   • lib/ai-tools/tools/draft-{email,sms}.ts — the on-demand agent
 *     tools that the SDK chat loop calls during a turn.
 *
 * Both used to live in `app/api/agent/quick-draft/route.ts` and the two
 * tool wrappers imported `composeQuickDraft` from that route file. Next.js
 * 15.5 enforces that route files only export the runtime / config /
 * HTTP-verb symbols — `composeQuickDraft` and `composeDraftWithOpenAI`
 * trip the type-checker:
 *
 *   Type error: Route "app/api/agent/quick-draft/route.ts" does not match
 *   the required types of a Next.js Route.
 *     "composeQuickDraft" is not a valid Route export field.
 *
 * The compose machinery has no business in a route file anyway — it's
 * library code two places need. Lives here now; the route imports it
 * back, the tool wrappers import it directly.
 */

import { getLLMClient, hasLLMKey, openaiModel } from '@/lib/llm';
import { logger } from '@/lib/logger';
import { enrichContext, type EnrichedContext } from '@/lib/ai-tools/context-enrichment';
import { getRecentVoiceSamples, type VoiceSample } from '@/lib/draft-voice';
import { detectSlop, summarizeSlop } from '@/lib/voice/slop';

// OpenRouter regularly needs more than five seconds to route and complete even
// this small generation. The old 5s guard deterministically aborted healthy
// production requests before the provider answered. Keep the interaction
// bounded, but allow the same 15s latency budget used by other foreground AI
// work; we still make only one compose call, so this does not amplify spend.
const TIMEOUT_MS = 15_000;
// This is a short structured copy task, not a reasoning task. gpt-5-mini can
// spend a small completion budget on hidden reasoning and return no visible
// JSON; gpt-4.1-mini is faster and reliably uses the budget for the requested
// subject/body payload.
const MODEL = 'gpt-4.1-mini';

export type Intent = 'check-in' | 'log-call' | 'welcome' | 'reach-out';
export type Context = 'deal' | 'person';
export type Channel = 'email' | 'sms' | 'note';

const SYSTEM_PROMPT =
  "You are Chippi, an AI assistant for a real-estate CRM. Compose ONE short outbound message the realtor can send right now. " +
  "Voice: warm, direct, human. Write like a sharp colleague, not a chatbot. Lead with the actual reason for the message. " +
  "GROUNDING: Use ONLY facts explicitly present in the user JSON. Never imply a prior conversation, new listings, available properties, attachments, appointments, tours, offers, or completed actions unless that exact fact appears in the user JSON. " +
  "When context is thin, write a neutral check-in and ask what would be useful; do not fill gaps with plausible real-estate details. " +
  "BANNED (these mark a message as machine-written): stock openers ('I hope this email finds you well', 'I wanted to reach out', 'I'm reaching out'); " +
  "assistant filler ('Great question', \"I'd be happy to\", 'Happy to help', 'Certainly', 'Absolutely!'); " +
  "hollow sign-offs ('Let me know if you have any questions', 'Please don't hesitate to reach out', 'Feel free to reach out', 'Looking forward to hearing from you'); " +
  "buzzword padding ('in today's fast-paced market', 'at the end of the day'); and em dashes anywhere. " +
  "No subject lines longer than 8 words. " +
  "Email body: 2-4 sentences, plain text, no markdown, no signature (the realtor's name is appended downstream). " +
  "Note body (when channel is 'note'): a single line summarizing what was discussed on a call, past tense, factual. " +
  "Output strict JSON with this shape and nothing else: {\"subject\": string|null, \"body\": string}. " +
  "Subject is a non-empty string for emails, null for notes.";

/**
 * High-risk factual claims that a polished real-estate draft can easily invent.
 * Prompt grounding is the first line of defence; this deterministic check is
 * the release valve when a provider ignores it. A phrase is allowed when the
 * same fact is actually present in the structured subject/activity payload.
 */
const CLAIM_GUARDS: ReadonlyArray<{ reason: string; pattern: RegExp }> = [
  {
    reason: 'invented_prior_conversation',
    pattern: /\b(?:as|like) we (?:discussed|talked about)|\bwe (?:discussed|spoke about|talked about)\b/i,
  },
  {
    reason: 'invented_inventory',
    pattern: /\b(?:new|fresh|just-listed) (?:listings?|properties|options)\b/i,
  },
  {
    reason: 'invented_inventory',
    pattern: /\bI (?:have|found|pulled) (?:some|a few|several|two|three)?\s*(?:listings?|properties|options)\b/i,
  },
  {
    reason: 'invented_appointment',
    pattern: /\b(?:your|the) (?:tour|showing|appointment) (?:is|has been) (?:scheduled|booked|confirmed)\b/i,
  },
  {
    reason: 'invented_attachment',
    pattern: /\b(?:I|we)(?:'ve| have)? (?:attached|sent) (?:the|a|an|some|those|these)\b/i,
  },
];

function unsupportedClaimReason(body: string, facts: unknown): string | null {
  const factCorpus = JSON.stringify(facts);
  for (const guard of CLAIM_GUARDS) {
    if (guard.pattern.test(body) && !guard.pattern.test(factCorpus)) return guard.reason;
  }
  return null;
}

/** How long the optional one-shot voice revision pass is allowed to take. */
const REVISE_TIMEOUT_MS = 4_000;

/**
 * Self-critique pass. A freshly composed email is run through the deterministic
 * slop detector; if it trips, we fire ONE revision call asking the model to
 * strip exactly those tells while keeping the facts, length, and the realtor's
 * voice intact. Returns the revised draft only when it is genuinely cleaner
 * (strictly fewer tells AND a non-empty body); otherwise the original stands.
 *
 * Best-effort and bounded: any failure, timeout, or non-improvement returns the
 * original untouched. This never blocks or fails a draft, it only upgrades one.
 */
async function reviseAwaySlop(
  client: ReturnType<typeof getLLMClient>,
  draft: { subject: string | null; body: string },
): Promise<{ subject: string | null; body: string }> {
  const findings = detectSlop(draft.body);
  if (findings.length === 0) return draft;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVISE_TIMEOUT_MS);
  try {
    const response = await client.chat.completions.create(
      {
        model: openaiModel(MODEL),
        temperature: 0.3,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You revise a short real-estate email to sound like a sharp human colleague, not an AI assistant. ' +
              'Keep every fact, the recipient, the length, and the realtor voice. Change ONLY the phrasing that reads as machine-written. ' +
              'Remove these specific tells: ' +
              summarizeSlop(findings) +
              '. Do not add new claims or pleasantries. Never use an em dash. ' +
              'Output strict JSON: {"subject": string|null, "body": string}.',
          },
          { role: 'user', content: JSON.stringify(draft) },
        ],
      },
      { signal: controller.signal },
    );
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return draft;
    const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    if (!body) return draft;
    // Only accept the rewrite when it actually reduced the slop. A revision
    // that introduces a different tell, or none fewer, is not an upgrade.
    if (detectSlop(body).length >= findings.length) return draft;
    const subject =
      typeof parsed.subject === 'string' && parsed.subject.trim().length > 0
        ? parsed.subject.trim()
        : draft.subject;
    logger.info('[quick-draft] revised away slop', { before: findings.length });
    return { subject, body };
  } catch (err) {
    logger.warn('[quick-draft] voice revision failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return draft;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the optional voice-reference system message. Empty string if there
 * are no samples (caller skips the message entirely in that case). Bodies
 * arrive truncated from `getRecentVoiceSamples`; this formats them and pins
 * the don't-copy rule that is the actual PII defense.
 *
 * The instruction is the load-bearing piece — these samples were written to
 * other recipients, and the model must treat them as cadence-only. If this
 * sentence is wrong, names leak; no regex on the input will save us.
 */
function buildVoiceMessage(samples: VoiceSample[]): string {
  if (samples.length === 0) return '';
  const lines: string[] = [
    "The realtor's voice — recent emails they sent to OTHER people. Match cadence, sentence length, and word choice only.",
    "Do NOT address the new recipient by any name that appears in these samples. Do NOT mention any deal, property, address, date, or detail from these samples — those belong to other recipients and would be a privacy breach.",
    "Use only the new recipient's facts from the user message; the samples are tone reference, never content.",
    '',
  ];
  samples.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.body}`);
    lines.push('');
  });
  return lines.join('\n').trimEnd();
}

/**
 * Phase 16: exported so on-demand agent tools (`draft_email`, `draft_sms`)
 * reuse the same OpenAI call instead of duplicating the prompt + JSON parse.
 * Same shape, same model, same voice rules.
 */
export async function composeDraftWithOpenAI(args: {
  intent: Intent;
  channel: Channel;
  subjectLabel: string;
  recentActivity: string[];
  daysQuiet: number | null;
  stage?: string;
  status?: string;
  scoreLabel?: string | null;
  leadScore?: number | null;
  voiceSamples: VoiceSample[];
}): Promise<{ subject: string | null; body: string } | null> {
  if (!hasLLMKey()) {
    logger.warn('[quick-draft] compose unavailable', { reason: 'missing_llm_key' });
    return null;
  }

  const userPayload = {
    intent: args.intent,
    channel: args.channel,
    subject: args.subjectLabel,
    daysSinceLastTouch: args.daysQuiet,
    recentActivity: args.recentActivity.slice(0, 6),
    stage: args.stage,
    status: args.status,
    scoreLabel: args.scoreLabel,
    leadScore: args.leadScore,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const client = getLLMClient();
    // Voice samples ride alongside SYSTEM_PROMPT, never replacing it. Empty
    // sample list → no second system message (current behavior preserved).
    const voiceMessage =
      args.channel === 'email' ? buildVoiceMessage(args.voiceSamples) : '';
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
    if (voiceMessage) messages.push({ role: 'system', content: voiceMessage });
    messages.push({ role: 'user', content: JSON.stringify(userPayload) });

    const response = await client.chat.completions.create(
      {
        model: openaiModel(MODEL),
        temperature: 0.4,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages,
      },
      { signal: controller.signal },
    );
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      logger.warn('[quick-draft] compose unusable', { reason: 'empty_response' });
      return null;
    }
    const parsed = JSON.parse(raw) as { subject?: unknown; body?: unknown };
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    if (!body) {
      logger.warn('[quick-draft] compose unusable', { reason: 'empty_body' });
      return null;
    }
    const subject =
      typeof parsed.subject === 'string' && parsed.subject.trim().length > 0
        ? parsed.subject.trim()
        : null;

    // Self-critique: for client-facing emails, evaluate the draft against the
    // slop detector and revise once if it reads like a bot. Notes are terse
    // internal call logs, not voice-sensitive, so they skip this. Best-effort:
    // a clean draft (the common case) does no extra work.
    const finalDraft =
      args.channel === 'email'
        ? await reviseAwaySlop(client, { subject, body })
        : { subject, body };

    if (args.channel === 'email') {
      const unsupportedReason = unsupportedClaimReason(finalDraft.body, userPayload);
      if (unsupportedReason) {
        logger.warn('[quick-draft] compose rejected', { reason: unsupportedReason });
        return null;
      }
    }

    return finalDraft;
  } catch (err) {
    logger.warn('[quick-draft] compose failed', { err: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Phase 16: one-call compose path for the on-demand agent's `draft_*` tools.
 *
 * Pure read — no AgentDraft row, no audit, no delivery. Mirrors the
 * preview-mode pipeline (enrichContext → optional voice samples → OpenAI),
 * but exposed as a function so the agent tools don't have to HTTP-call
 * themselves or duplicate the prompt.
 *
 * Returns null if the subject can't be enriched (unknown id) or if the
 * OpenAI call fails — callers translate that to a user-facing error.
 */
export async function composeQuickDraft(args: {
  kind: Context;
  id: string;
  intent: Intent;
  channel: Channel;
  spaceId: string;
}): Promise<{ subject: string | null; body: string; subjectLabel: string } | null> {
  const enriched: EnrichedContext | null = await enrichContext(
    { kind: args.kind, id: args.id },
    args.spaceId,
  );
  if (!enriched) return null;

  const voiceSamples =
    args.channel === 'email' ? await getRecentVoiceSamples(args.spaceId) : [];

  const composed = await composeDraftWithOpenAI({
    intent: args.intent,
    channel: args.channel,
    subjectLabel: enriched.subjectLabel,
    recentActivity: enriched.lastActivities,
    daysQuiet: enriched.daysSinceLastTouch,
    stage: enriched.stage,
    status: enriched.status,
    scoreLabel: enriched.scoreLabel,
    leadScore: enriched.leadScore,
    voiceSamples,
  });
  if (!composed) return null;

  return { ...composed, subjectLabel: enriched.subjectLabel };
}
