/**
 * CONDITION ATTRIBUTE CATALOG — the human layer over raw condition fields.
 *
 * The IF step compares a dotted path (e.g. 'lead.score') against a value. Left
 * raw, that leaks the engine's data model at the realtor — they'd have to know
 * the path, pick a bare operator, and type a value. This catalog turns those
 * paths into curated, friendly ATTRIBUTES: 'Lead score' (a number) instead of
 * 'lead.score', with only the operators that make sense for its type.
 *
 * The catalog is a PURE UI layer. It never changes the stored shape — a row is
 * still { field, operator, value } strings. An attribute just maps a label and
 * type onto a known `field`, and the editor uses `findAttributeByField` to
 * recognise a stored row and drive the human UI. Any unknown/custom path falls
 * through to the Advanced escape hatch (raw field input), so arbitrary dotted
 * paths are never lost.
 *
 * Pure data. The only schema imports are the Operator/TriggerType unions so
 * this stays a cheap, testable lookup the builder consumes.
 */

import type { Operator, TriggerType } from '@/lib/workflows/schema';

/** A curated, human-labelled condition attribute over a known engine field. */
export interface ConditionAttribute {
  /** Stable id, independent of the dotted path. */
  key: string;
  /** Human label shown in the attribute picker, e.g. 'Lead score'. */
  label: string;
  /** The dotted path the engine compares, e.g. 'lead.score'. */
  field: string;
  /** Drives which operators and which value input the editor offers. */
  valueType: 'number' | 'text' | 'enum';
  /** Choices for an enum attribute (the value input becomes a select). */
  options?: { value: string; label: string }[];
  /** Operators that make sense for this attribute's type. Non-empty. */
  operators: Operator[];
  /** Triggers this attribute leads with; absent = only via the common set. */
  appliesTo?: TriggerType[];
}

// ── Operator sets per value type ─────────────────────────────────────────────
// Each is a subset of the schema's OPERATORS, phrased so the resulting
// label reads sensibly (the editor renders these via OPERATOR_LABELS).

const NUMBER_OPERATORS: Operator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
const TEXT_OPERATORS: Operator[] = [
  'contains',
  'not_contains',
  'eq',
  'neq',
  'starts_with',
  'ends_with',
  'exists',
  'not_exists',
];
const ENUM_OPERATORS: Operator[] = ['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists'];

// ── The catalog ──────────────────────────────────────────────────────────────
// Keyed by `key` for de-dupe; `field` is the reverse-lookup key the editor
// uses to recognise a stored row.

export const CONDITION_ATTRIBUTES: ConditionAttribute[] = [
  {
    key: 'lead_score',
    label: 'Lead score',
    field: 'lead.score',
    valueType: 'number',
    operators: NUMBER_OPERATORS,
    appliesTo: ['lead_created', 'lead_score_threshold', 'tour_completed'],
  },
  {
    key: 'lead_source',
    label: 'Lead source',
    field: 'lead.source',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['lead_created', 'lead_score_threshold'],
  },
  {
    key: 'lead_name',
    label: 'Lead name',
    field: 'lead.name',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['lead_created', 'lead_score_threshold'],
  },
  {
    key: 'lead_email',
    label: 'Lead email',
    field: 'lead.email',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['lead_created', 'lead_score_threshold'],
  },
  {
    key: 'contact_name',
    label: 'Contact name',
    field: 'contact.name',
    valueType: 'text',
    operators: TEXT_OPERATORS,
  },
  {
    key: 'message_body',
    label: 'Message text',
    field: 'message.body',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['inbound_message'],
  },
  {
    key: 'message_channel',
    label: 'Message channel',
    field: 'message.channel',
    valueType: 'enum',
    options: [
      { value: 'email', label: 'Email' },
    ],
    operators: ENUM_OPERATORS,
    appliesTo: ['inbound_message'],
  },
  {
    key: 'deal_stage',
    label: 'Deal stage',
    field: 'deal.stage',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['tour_completed', 'deal_stage_changed'],
  },
  {
    key: 'event_to_stage',
    label: 'Moved to stage',
    field: 'event.toStage',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['deal_stage_changed'],
  },
  {
    key: 'event_toolkit',
    label: 'App / toolkit',
    field: 'event.toolkit',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['integration_event'],
  },
  {
    key: 'event_name',
    label: 'App event name',
    field: 'event.name',
    valueType: 'text',
    operators: TEXT_OPERATORS,
    appliesTo: ['integration_event'],
  },
];

/**
 * Attributes always worth offering, by key — useful on every trigger. They
 * round out a trigger's specific set so the common path needs zero typing.
 */
const COMMON_KEYS = ['lead_score', 'lead_source', 'contact_name'] as const;

/**
 * Ordered attributes for a trigger: the trigger-specific ones first (catalog
 * order), then the common fallback set, de-duplicated by key. Every returned
 * attribute carries a non-empty `operators` subset of the schema's OPERATORS.
 */
export function attributesForTrigger(triggerType: TriggerType): ConditionAttribute[] {
  const seen = new Set<string>();
  const ordered: ConditionAttribute[] = [];

  const push = (attr: ConditionAttribute | undefined) => {
    if (!attr || seen.has(attr.key)) return;
    seen.add(attr.key);
    ordered.push(attr);
  };

  // Trigger-relevant first, preserving catalog order.
  for (const attr of CONDITION_ATTRIBUTES) {
    if (attr.appliesTo?.includes(triggerType)) push(attr);
  }
  // Then the universal fallback set.
  for (const key of COMMON_KEYS) {
    push(CONDITION_ATTRIBUTES.find((a) => a.key === key));
  }
  return ordered;
}

/**
 * Reverse lookup: the attribute whose `field` matches the stored path, or null
 * for an unknown/custom path. The editor uses this to recognise a row and
 * drive the human UI; null routes the row to the Advanced raw-field escape
 * hatch so arbitrary paths stay fully editable.
 */
export function findAttributeByField(field: string): ConditionAttribute | null {
  return CONDITION_ATTRIBUTES.find((a) => a.field === field) ?? null;
}
