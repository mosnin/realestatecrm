/**
 * The safe condition evaluator. These tests pin every operator (happy + edge),
 * nested AND/OR groups, numeric coercion + NaN safety, array membership, the
 * missing-field-is-falsy rule, the empty-group semantics, and — most important
 * — the prototype-pollution defense: hostile field paths resolve to undefined,
 * never throw, and never touch Object.prototype.
 */

import { describe, it, expect } from 'vitest';
import { evaluateConditions, resolveField } from '@/lib/workflows/conditions';
import type { ConditionGroup, ConditionRule, Operator } from '@/lib/workflows/schema';

/** Wrap a single rule in an AND group so we can drive evaluateConditions. */
function check(rule: ConditionRule, context: Record<string, unknown>): boolean {
  return evaluateConditions({ op: 'and', rules: [rule] }, context);
}

const rule = (field: string, operator: Operator, value?: unknown): ConditionRule => ({
  field,
  operator,
  value,
});

describe('resolveField', () => {
  const ctx = {
    lead: { score: 80, name: 'Ada', tags: ['hot', 'buyer'] },
    flag: false,
    nothing: null,
  };

  it('resolves nested dotted paths', () => {
    expect(resolveField(ctx, 'lead.score')).toBe(80);
    expect(resolveField(ctx, 'lead.name')).toBe('Ada');
  });

  it('resolves array index segments', () => {
    expect(resolveField(ctx, 'lead.tags.0')).toBe('hot');
    expect(resolveField(ctx, 'lead.tags.1')).toBe('buyer');
  });

  it('returns undefined for missing paths and bad hops', () => {
    expect(resolveField(ctx, 'lead.missing')).toBeUndefined();
    expect(resolveField(ctx, 'lead.score.deeper')).toBeUndefined();
    expect(resolveField(ctx, 'absent')).toBeUndefined();
    expect(resolveField(ctx, '')).toBeUndefined();
    expect(resolveField(ctx, 'nothing.x')).toBeUndefined();
  });

  it('preserves falsy own values', () => {
    expect(resolveField(ctx, 'flag')).toBe(false);
    expect(resolveField(ctx, 'nothing')).toBeNull();
  });
});

describe('operators — equality + comparison', () => {
  const ctx = { n: 10, s: 'hello', t: true };

  it('eq / neq use strict equality', () => {
    expect(check(rule('n', 'eq', 10), ctx)).toBe(true);
    expect(check(rule('n', 'eq', '10'), ctx)).toBe(false); // no type coercion
    expect(check(rule('n', 'neq', 11), ctx)).toBe(true);
    expect(check(rule('t', 'eq', true), ctx)).toBe(true);
  });

  it('gt / gte / lt / lte compare numerically', () => {
    expect(check(rule('n', 'gt', 5), ctx)).toBe(true);
    expect(check(rule('n', 'gt', 10), ctx)).toBe(false);
    expect(check(rule('n', 'gte', 10), ctx)).toBe(true);
    expect(check(rule('n', 'lt', 20), ctx)).toBe(true);
    expect(check(rule('n', 'lte', 10), ctx)).toBe(true);
    expect(check(rule('n', 'lt', 5), ctx)).toBe(false);
  });

  it('coerces numeric strings before comparing', () => {
    expect(check(rule('n', 'gte', '10'), { n: '10' })).toBe(true);
    expect(check(rule('n', 'gt', '5'), { n: '10' })).toBe(true);
  });

  it('is NaN-safe: non-numeric operands make numeric ops false', () => {
    expect(check(rule('s', 'gt', 5), ctx)).toBe(false); // 'hello' -> NaN
    expect(check(rule('n', 'lt', 'banana'), ctx)).toBe(false);
    expect(check(rule('missing', 'gte', 0), ctx)).toBe(false);
  });
});

describe('operators — string ops', () => {
  const ctx = { s: 'hello world' };

  it('contains / not_contains on strings (substring)', () => {
    expect(check(rule('s', 'contains', 'world'), ctx)).toBe(true);
    expect(check(rule('s', 'contains', 'xyz'), ctx)).toBe(false);
    expect(check(rule('s', 'not_contains', 'xyz'), ctx)).toBe(true);
  });

  it('starts_with / ends_with', () => {
    expect(check(rule('s', 'starts_with', 'hello'), ctx)).toBe(true);
    expect(check(rule('s', 'starts_with', 'world'), ctx)).toBe(false);
    expect(check(rule('s', 'ends_with', 'world'), ctx)).toBe(true);
    expect(check(rule('s', 'ends_with', 'hello'), ctx)).toBe(false);
  });
});

describe('operators — array ops', () => {
  const ctx = { tags: ['hot', 'buyer'], score: 80 };

  it('contains / not_contains on arrays (membership)', () => {
    expect(check(rule('tags', 'contains', 'hot'), ctx)).toBe(true);
    expect(check(rule('tags', 'contains', 'cold'), ctx)).toBe(false);
    expect(check(rule('tags', 'not_contains', 'cold'), ctx)).toBe(true);
  });

  it('in / not_in check membership in the operand array', () => {
    expect(check(rule('score', 'in', [70, 80, 90]), ctx)).toBe(true);
    expect(check(rule('score', 'in', [1, 2, 3]), ctx)).toBe(false);
    expect(check(rule('score', 'not_in', [1, 2, 3]), ctx)).toBe(true);
  });

  it('in is false when the operand is not an array', () => {
    expect(check(rule('score', 'in', 80), ctx)).toBe(false);
    expect(check(rule('score', 'not_in', 80), ctx)).toBe(true);
  });
});

describe('operators — existence', () => {
  const ctx = { present: 0, empty: '', nul: null, undef: undefined };

  it('exists is true for any non-null/undefined value (including falsy)', () => {
    expect(check(rule('present', 'exists'), ctx)).toBe(true);
    expect(check(rule('empty', 'exists'), ctx)).toBe(true);
    expect(check(rule('nul', 'exists'), ctx)).toBe(false);
    expect(check(rule('missing', 'exists'), ctx)).toBe(false);
  });

  it('not_exists is the inverse', () => {
    expect(check(rule('nul', 'not_exists'), ctx)).toBe(true);
    expect(check(rule('missing', 'not_exists'), ctx)).toBe(true);
    expect(check(rule('present', 'not_exists'), ctx)).toBe(false);
  });
});

describe('unknown operator fails closed', () => {
  it('returns false for an operator the evaluator does not know', () => {
    const bad = { field: 'n', operator: 'between' as Operator, value: 1 };
    expect(check(bad, { n: 5 })).toBe(false);
  });
});

describe('missing field is falsy', () => {
  it('a rule on an absent field never passes (except not_exists)', () => {
    const ctx = {};
    expect(check(rule('a.b.c', 'eq', 1), ctx)).toBe(false);
    expect(check(rule('a.b.c', 'contains', 'x'), ctx)).toBe(false);
    expect(check(rule('a.b.c', 'gt', 0), ctx)).toBe(false);
    expect(check(rule('a.b.c', 'not_exists'), ctx)).toBe(true);
  });
});

describe('string ops short-circuit on missing fields (no "undefined"/"null" match)', () => {
  const ctx = { s: 'hello world' };

  it('contains / starts_with / ends_with on a MISSING field → false', () => {
    // Without the guard, String(undefined) === 'undefined' would match 'und'.
    expect(check(rule('missing', 'contains', 'und'), ctx)).toBe(false);
    expect(check(rule('missing', 'starts_with', 'und'), ctx)).toBe(false);
    expect(check(rule('missing', 'ends_with', 'ined'), ctx)).toBe(false);
    // Same for a null-valued field (String(null) === 'null').
    expect(check(rule('nul', 'contains', 'nul'), { nul: null })).toBe(false);
    expect(check(rule('nul', 'starts_with', 'n'), { nul: null })).toBe(false);
  });

  it('not_contains on a MISSING field → true (a missing field contains nothing)', () => {
    expect(check(rule('missing', 'not_contains', 'und'), ctx)).toBe(true);
    expect(check(rule('nul', 'not_contains', 'nul'), { nul: null })).toBe(true);
  });

  it('defined-value string behavior is unchanged', () => {
    expect(check(rule('s', 'contains', 'world'), ctx)).toBe(true);
    expect(check(rule('s', 'not_contains', 'xyz'), ctx)).toBe(true);
    expect(check(rule('s', 'starts_with', 'hello'), ctx)).toBe(true);
    expect(check(rule('s', 'ends_with', 'world'), ctx)).toBe(true);
  });
});

describe('nested AND / OR groups', () => {
  const ctx = { lead: { score: 80, type: 'buyer' }, channel: 'sms' };

  it('AND requires every member', () => {
    const group: ConditionGroup = {
      op: 'and',
      rules: [
        rule('lead.score', 'gte', 80),
        rule('lead.type', 'eq', 'buyer'),
      ],
    };
    expect(evaluateConditions(group, ctx)).toBe(true);
    group.rules.push(rule('channel', 'eq', 'email'));
    expect(evaluateConditions(group, ctx)).toBe(false);
  });

  it('OR requires any member', () => {
    const group: ConditionGroup = {
      op: 'or',
      rules: [rule('lead.score', 'lt', 50), rule('channel', 'eq', 'sms')],
    };
    expect(evaluateConditions(group, ctx)).toBe(true);
  });

  it('evaluates nested groups recursively', () => {
    const group: ConditionGroup = {
      op: 'and',
      rules: [
        rule('lead.score', 'gte', 80),
        {
          op: 'or',
          rules: [rule('channel', 'eq', 'email'), rule('lead.type', 'eq', 'buyer')],
        },
      ],
    };
    expect(evaluateConditions(group, ctx)).toBe(true);
  });
});

describe('empty-group semantics', () => {
  it('empty AND is true (AND of nothing)', () => {
    expect(evaluateConditions({ op: 'and', rules: [] }, {})).toBe(true);
  });

  it('empty OR is false (OR of nothing)', () => {
    expect(evaluateConditions({ op: 'or', rules: [] }, {})).toBe(false);
  });
});

describe('SECURITY: prototype-pollution defense', () => {
  it('resolves __proto__ / constructor / prototype segments to undefined', () => {
    const ctx = { lead: { score: 80 } };
    expect(resolveField(ctx, '__proto__')).toBeUndefined();
    expect(resolveField(ctx, '__proto__.polluted')).toBeUndefined();
    expect(resolveField(ctx, 'constructor')).toBeUndefined();
    expect(resolveField(ctx, 'constructor.prototype.x')).toBeUndefined();
    expect(resolveField(ctx, 'lead.__proto__.toString')).toBeUndefined();
  });

  it('a hostile rule never pollutes Object.prototype and never throws', () => {
    // Sentinel: prove the prototype is clean before and after.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const hostile: ConditionGroup = {
      op: 'or',
      rules: [
        rule('__proto__.polluted', 'eq', 'yes'),
        rule('constructor.prototype.x', 'exists'),
        // An eq against the operand can't write through to the prototype.
        rule('__proto__', 'eq', { polluted: 'yes' }),
      ],
    };

    expect(() => evaluateConditions(hostile, {})).not.toThrow();
    // OR of three rules that all resolve to undefined -> false.
    expect(evaluateConditions(hostile, {})).toBe(false);

    // Object.prototype is untouched: a fresh object has no `polluted` / `x`.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('ignores inherited (non-own) properties on the context', () => {
    // A value carried on the prototype chain must be invisible to resolveField.
    const proto = { inherited: 'secret' };
    const ctx = Object.create(proto) as Record<string, unknown>;
    ctx.own = 'visible';
    expect(resolveField(ctx, 'own')).toBe('visible');
    expect(resolveField(ctx, 'inherited')).toBeUndefined();
  });
});
