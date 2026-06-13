/**
 * Nurture play definitions — the playbook, as code.
 *
 * A "play" is a fixed, multi-step nurture sequence Chippi runs on a contact's
 * behalf. There is no NurturePlay table: a play DEFINITION lives here as a
 * constant, and a play ENROLLMENT is an AgentGoal row whose metadata carries
 * `{ playKind, step }` with `nextActionAt` set to when the current step is due
 * (see lib/plays/enroll.ts + the play-advancement cron).
 *
 * Each step DRAFTS — the advancement cron turns the step into a pending
 * AgentDraft in the approval inbox. Nothing leaves without the realtor's name
 * on it. The `prompt` is the seed Chippi uses to write that draft.
 *
 * Configuration is a failure to decide: there are exactly four plays, picked,
 * not toggled. Adding a fifth means cutting one or making the case for it.
 */

/** The channel a single step drafts on. Maps to AgentDraft.channel. */
export type PlayActionType = 'email' | 'sms';

/**
 * The composer intent for a step. The advancement cron does NOT call an LLM
 * directly — it hands this intent + the contact's enriched context to the same
 * quick-draft composer the chat `draft_*` tools use, so the inbox gets a real
 * message in the realtor's voice rather than a raw instruction. Mirrors
 * `Intent` in lib/agent/quick-draft.ts.
 */
export type PlayIntent = 'check-in' | 'log-call' | 'welcome' | 'reach-out';

/** The four plays we ship. The kind is the stable id stored in goal metadata. */
export type PlayKind =
  | 'speed_to_lead'
  | 'long_term_drip'
  | 'post_tour'
  | 'dormant_winback';

/** AgentGoal.goalType values a play is allowed to use (CHECK-constrained). */
export type PlayGoalType = 'follow_up_sequence' | 'reengagement';

export interface PlayStep {
  /** 0-based index. metadata.step points at the NEXT step to fire. */
  step: number;
  actionType: PlayActionType;
  /** Days from the prior step (or from enrollment for step 0) until due. */
  delayDays: number;
  /** Composer intent — drives the LLM draft the cron stages for approval. */
  intent: PlayIntent;
  /** Seed instruction / human-readable "why" shown on the inbox draft card. */
  prompt: string;
}

export interface PlayDefinition {
  kind: PlayKind;
  name: string;
  /** One calm sentence — what this play is for. Shown on the Plays surface. */
  description: string;
  goalType: PlayGoalType;
  steps: PlayStep[];
}

/**
 * speed_to_lead — the launch wedge. A brand-new lead gets a fast first touch,
 * a same-day nudge, and a two-day check so it never goes cold in the gap
 * between "form submitted" and "realtor noticed."
 */
const SPEED_TO_LEAD: PlayDefinition = {
  kind: 'speed_to_lead',
  name: 'Speed to lead',
  description: 'Reach a brand-new lead fast, then twice more, before it cools.',
  goalType: 'follow_up_sequence',
  steps: [
    {
      step: 0,
      actionType: 'email',
      delayDays: 0,
      intent: 'welcome',
      prompt:
        'Warm first-touch email to a brand-new lead — thank them, confirm the inquiry, nudge toward a tour.',
    },
    {
      step: 1,
      actionType: 'sms',
      delayDays: 1,
      intent: 'check-in',
      prompt: 'Short next-day text following up on the first email, offering to find a time.',
    },
    {
      step: 2,
      actionType: 'email',
      delayDays: 2,
      intent: 'check-in',
      prompt: 'Low-pressure check-in two days later, leaving the door open to reply anytime.',
    },
  ],
};

/**
 * long_term_drip — a lead who is real but months out. A light touch every
 * few weeks keeps Chippi present without nagging, so when they are ready the
 * realtor is already top of mind.
 */
const LONG_TERM_DRIP: PlayDefinition = {
  kind: 'long_term_drip',
  name: 'Long-term drip',
  description: 'Stay quietly present with a months-out lead, weeks apart.',
  goalType: 'follow_up_sequence',
  steps: [
    {
      step: 0,
      actionType: 'email',
      delayDays: 14,
      intent: 'check-in',
      prompt: 'Value-first email for a months-out lead — one useful market note, no ask.',
    },
    {
      step: 1,
      actionType: 'email',
      delayDays: 21,
      intent: 'check-in',
      prompt: 'Light second touch three weeks on — genuine check-in, ask if the timeline shifted.',
    },
    {
      step: 2,
      actionType: 'sms',
      delayDays: 30,
      intent: 'check-in',
      prompt: 'Brief text a month later — here when the time is right. One sentence.',
    },
  ],
};

/**
 * post_tour — fires after a tour completes. A same-day thank-you, a next-day
 * feel-out for objections, and a three-day step toward an application keep the
 * momentum the tour created from leaking away.
 */
const POST_TOUR: PlayDefinition = {
  kind: 'post_tour',
  name: 'Post-tour',
  description: 'Carry a tour into next steps with a same-day thank-you and two follow-throughs.',
  goalType: 'follow_up_sequence',
  steps: [
    {
      step: 0,
      actionType: 'email',
      delayDays: 0,
      intent: 'check-in',
      prompt: 'Same-day thank-you after the tour — ask for their honest first impression.',
    },
    {
      step: 1,
      actionType: 'sms',
      delayDays: 1,
      intent: 'check-in',
      prompt: 'Next-day text to surface any hesitation, offer to talk it through.',
    },
    {
      step: 2,
      actionType: 'email',
      delayDays: 3,
      intent: 'check-in',
      prompt: 'Move toward the next step — how to apply or make an offer, concrete and easy.',
    },
  ],
};

/**
 * dormant_winback — a contact who went quiet. A reengagement sequence: one
 * honest re-opener, then one final, no-pressure note before Chippi lets it
 * rest. goalType 'reengagement' so the brief and analytics read it correctly.
 */
const DORMANT_WINBACK: PlayDefinition = {
  kind: 'dormant_winback',
  name: 'Dormant win-back',
  description: 'Re-open a quiet contact with one honest note, then one last light touch.',
  goalType: 'reengagement',
  steps: [
    {
      step: 0,
      actionType: 'email',
      delayDays: 0,
      intent: 'reach-out',
      prompt: 'Warm re-opener to a quiet contact — honest that it has been a while, no guilt, one open question.',
    },
    {
      step: 1,
      actionType: 'sms',
      delayDays: 5,
      intent: 'reach-out',
      prompt: 'One last low-key text — will stop reaching out unless they want to pick it back up.',
    },
  ],
};

/** The four plays, keyed by kind for O(1) lookup in the cron + tool. */
export const PLAYS: Record<PlayKind, PlayDefinition> = {
  speed_to_lead: SPEED_TO_LEAD,
  long_term_drip: LONG_TERM_DRIP,
  post_tour: POST_TOUR,
  dormant_winback: DORMANT_WINBACK,
};

/** Ordered list — for the Plays surface and the tool's enum. */
export const ALL_PLAYS: PlayDefinition[] = [
  SPEED_TO_LEAD,
  LONG_TERM_DRIP,
  POST_TOUR,
  DORMANT_WINBACK,
];

export const PLAY_KINDS = ALL_PLAYS.map((p) => p.kind) as [PlayKind, ...PlayKind[]];

/** Lookup with a typed return. Returns null for an unknown kind. */
export function getPlay(kind: string): PlayDefinition | null {
  return (PLAYS as Record<string, PlayDefinition | undefined>)[kind] ?? null;
}
