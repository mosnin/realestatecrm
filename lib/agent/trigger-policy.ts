import { enrollInPlay } from '@/lib/plays/enroll';
import type { PlayKind } from '@/lib/plays/definitions';

const VALID_EVENTS = [
  'new_lead',
  'tour_completed',
  'deal_stage_changed',
  'application_submitted',
  'inbound_message',
  'goal_completed',
] as const;

export type TriggerEvent = typeof VALID_EVENTS[number];

/**
 * Proactive nurture: some trigger events auto-enroll the contact on a play so
 * Chippi starts working the relationship without the realtor asking. The map
 * is intentionally tiny — only the two events with an obvious, non-annoying
 * default sequence. enrollInPlay is idempotent, so a duplicate event (form +
 * manual add firing new_lead twice) won't stack two sequences.
 */
const PLAY_FOR_EVENT: Partial<Record<TriggerEvent, PlayKind>> = {
  new_lead: 'speed_to_lead',
  tour_completed: 'post_tour',
};

/**
 * Fire-and-forget play enrollment for a trigger. Never throws — proactive
 * autonomy must never break the trigger that spawned it. Called from the
 * trigger queueing path (lib/agent/fire-trigger.ts) right after the event is
 * accepted; a missing contactId or an unmapped event is a silent no-op.
 */
export async function enrollPlaysForTrigger(
  event: TriggerEvent,
  spaceId: string,
  contactId: string | null | undefined,
): Promise<void> {
  const playKind = PLAY_FOR_EVENT[event];
  if (!playKind || !contactId) return;
  try {
    await enrollInPlay(spaceId, contactId, playKind, { enrolledBy: `trigger:${event}` });
  } catch {
    // Best-effort. The trigger itself already queued; a play miss is recoverable.
  }
}


const parsedCache = new Map<string, Set<TriggerEvent>>();
const warnedInvalidValues = new Set<string>();
const warnedEmptyValues = new Set<string>();

export function isTriggerEvent(value: string): value is TriggerEvent {
  return VALID_EVENTS.includes(value as TriggerEvent);
}

export function parseImmediateEvents(rawValue: string | undefined): Set<TriggerEvent> {
  const raw = rawValue?.trim() ?? '';
  if (!raw || raw.toLowerCase() === 'all') return new Set<TriggerEvent>(VALID_EVENTS);
  const cached = parsedCache.get(raw);
  if (cached) return new Set<TriggerEvent>(cached);

  const tokens = raw.split(',').map((v) => v.trim()).filter(Boolean);
  const parsed = tokens.filter((v): v is TriggerEvent => isTriggerEvent(v));

  const invalid = tokens.filter((v) => !isTriggerEvent(v));
  if (invalid.length > 0) {
    if (!warnedInvalidValues.has(raw)) {
      console.warn('[agent/trigger] Invalid AGENT_IMMEDIATE_EVENTS tokens; defaulting to all', {
        invalid,
        allowed: VALID_EVENTS,
      });
      warnedInvalidValues.add(raw);
    }
    return new Set<TriggerEvent>(VALID_EVENTS);
  }

  if (parsed.length === 0) {
    if (!warnedEmptyValues.has(raw)) {
      console.warn('[agent/trigger] Empty AGENT_IMMEDIATE_EVENTS after parsing; defaulting to all');
      warnedEmptyValues.add(raw);
    }
    return new Set<TriggerEvent>(VALID_EVENTS);
  }

  const result = new Set<TriggerEvent>(parsed);
  parsedCache.set(raw, result);
  return new Set<TriggerEvent>(result);
}
