/**
 * Unit tests for the condition attribute catalog — the human layer over raw
 * condition fields in the workflow builder's IF step.
 *
 * The catalog is a PURE UI lookup: it maps friendly labels + value types onto
 * known engine fields and offers only the operators that fit each type. These
 * tests pin the contracts the editor leans on:
 *   - attributesForTrigger orders trigger-relevant attributes first, always
 *     includes the common fallback, de-dupes by key, and only ever returns
 *     valid (non-empty, schema-subset) operator sets.
 *   - findAttributeByField round-trips every catalog field and returns null for
 *     an unknown path (which routes the editor to its Advanced escape hatch).
 *
 * Pure: no DOM, no React, no fetch.
 */

import { describe, it, expect } from 'vitest';
import {
  CONDITION_ATTRIBUTES,
  attributesForTrigger,
  findAttributeByField,
} from '@/components/workflows/field-catalog';
import { OPERATORS, type TriggerType } from '@/lib/workflows/schema';

const OPERATOR_SET = new Set<string>(OPERATORS);

const ALL_TRIGGERS: TriggerType[] = [
  'lead_created',
  'lead_score_threshold',
  'inbound_message',
  'tour_completed',
  'deal_stage_changed',
  'integration_event',
  'schedule',
];

const COMMON_KEYS = ['lead_score', 'lead_source', 'contact_name'];

describe('attributesForTrigger', () => {
  it('returns trigger-relevant attributes before the common fallback', () => {
    const attrs = attributesForTrigger('inbound_message');
    const keys = attrs.map((a) => a.key);
    // Message attributes apply to inbound_message; they should lead the common
    // fallback set.
    expect(keys.indexOf('message_body')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('message_body')).toBeLessThan(keys.indexOf('contact_name'));
  });

  it('always includes the common fallback set for every trigger', () => {
    for (const trigger of ALL_TRIGGERS) {
      const keys = attributesForTrigger(trigger).map((a) => a.key);
      for (const common of COMMON_KEYS) {
        expect(keys).toContain(common);
      }
    }
  });

  it('de-dupes by key (a trigger-specific attribute is not repeated by the fallback)', () => {
    // lead_score is both a lead_created attribute AND a common-fallback key.
    const keys = attributesForTrigger('lead_created').map((a) => a.key);
    const scoreCount = keys.filter((k) => k === 'lead_score').length;
    expect(scoreCount).toBe(1);

    // No trigger should ever yield a duplicate key.
    for (const trigger of ALL_TRIGGERS) {
      const ks = attributesForTrigger(trigger).map((a) => a.key);
      expect(new Set(ks).size).toBe(ks.length);
    }
  });

  it('only returns attributes with a non-empty operator set that is a subset of OPERATORS', () => {
    for (const trigger of ALL_TRIGGERS) {
      for (const attr of attributesForTrigger(trigger)) {
        expect(attr.operators.length).toBeGreaterThan(0);
        for (const op of attr.operators) {
          expect(OPERATOR_SET.has(op)).toBe(true);
        }
      }
    }
  });
});

describe('findAttributeByField', () => {
  it('round-trips every catalog attribute by its field', () => {
    for (const attr of CONDITION_ATTRIBUTES) {
      const found = findAttributeByField(attr.field);
      expect(found).not.toBeNull();
      expect(found?.key).toBe(attr.key);
    }
  });

  it('returns null for an unknown/custom path', () => {
    expect(findAttributeByField('totally.unknown.path')).toBeNull();
    expect(findAttributeByField('')).toBeNull();
  });
});

describe('operator sets are type-appropriate', () => {
  it('a number attribute offers numeric comparisons and excludes contains', () => {
    const score = findAttributeByField('lead.score');
    expect(score?.valueType).toBe('number');
    expect(score?.operators).toContain('gte');
    expect(score?.operators).toContain('lt');
    expect(score?.operators).not.toContain('contains');
  });

  it('a text attribute includes contains', () => {
    const source = findAttributeByField('lead.source');
    expect(source?.valueType).toBe('text');
    expect(source?.operators).toContain('contains');
  });

  it('an enum attribute carries options and in/not_in operators', () => {
    const channel = findAttributeByField('message.channel');
    expect(channel?.valueType).toBe('enum');
    expect(channel?.options?.length).toBeGreaterThan(0);
    expect(channel?.operators).toContain('in');
    expect(channel?.operators).toContain('not_in');
  });
});
