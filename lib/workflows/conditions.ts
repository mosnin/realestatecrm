/**
 * Safe condition evaluator for workflow definitions.
 *
 * Given a ConditionGroup (the IF tree validated by schema.ts) and a context
 * object (the trigger payload), decide whether the workflow should proceed.
 *
 * Two safety properties this module guarantees:
 *   1. No code execution. Fields are resolved by walking own enumerable
 *      properties only — never eval/Function/with, never bracket access into
 *      the prototype chain. A path segment of '__proto__', 'constructor', or
 *      'prototype' is rejected, so a hostile field can neither read nor pollute
 *      Object.prototype.
 *   2. Total + pure. Every operator returns a boolean; an unknown operator or a
 *      missing field is falsy rather than throwing. No I/O, no imports beyond
 *      the types from schema.ts.
 */

import type { ConditionGroup, ConditionRule, Operator } from './schema';

/** Segments that could reach the prototype chain. Never resolved. */
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Resolve a dotted path against `context`, prototype-pollution safe.
 *
 * Walks one segment at a time, reading ONLY own enumerable properties via
 * Object.prototype.hasOwnProperty.call (so inherited members and accessors on
 * the prototype chain are invisible). Array index segments like 'tags.0' work
 * because numeric own properties of arrays are enumerable. Any forbidden
 * segment, any non-object hop, or any missing key short-circuits to undefined.
 */
export function resolveField(
  context: Record<string, unknown>,
  path: string,
): unknown {
  if (typeof path !== 'string' || path.length === 0) return undefined;

  let current: unknown = context;
  for (const segment of path.split('.')) {
    if (FORBIDDEN_SEGMENTS.has(segment)) return undefined;
    if (current === null || typeof current !== 'object') return undefined;
    // Own enumerable read only — never touch the prototype chain.
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Coerce to Number; NaN propagates so numeric ops can reject it. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  if (value instanceof Date) return value.getTime();
  return NaN;
}

/** A numeric compare that is false whenever either side isn't a real number. */
function numericCompare(
  left: unknown,
  right: unknown,
  cmp: (a: number, b: number) => boolean,
): boolean {
  const a = toNumber(left);
  const b = toNumber(right);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return cmp(a, b);
}

/** Membership of `needle` in an array `haystack` (false if not an array). */
function arrayIncludes(haystack: unknown, needle: unknown): boolean {
  return Array.isArray(haystack) && haystack.includes(needle);
}

/**
 * Apply one operator to a resolved field value and the rule's operand.
 * Unknown operators return false. Numeric ops are NaN-safe; string ops coerce
 * via String(); 'contains' also matches array membership.
 */
function applyOperator(
  operator: Operator,
  resolved: unknown,
  operand: unknown,
): boolean {
  switch (operator) {
    case 'eq':
      return resolved === operand;
    case 'neq':
      return resolved !== operand;
    case 'gt':
      return numericCompare(resolved, operand, (a, b) => a > b);
    case 'gte':
      return numericCompare(resolved, operand, (a, b) => a >= b);
    case 'lt':
      return numericCompare(resolved, operand, (a, b) => a < b);
    case 'lte':
      return numericCompare(resolved, operand, (a, b) => a <= b);
    case 'contains':
      // Array membership, or substring when the field is string-like. A missing
      // field is NOT a match — guard before String() coerces null/undefined to
      // "null"/"undefined" (mirrors the NaN guard on numeric ops).
      if (Array.isArray(resolved)) return resolved.includes(operand);
      if (resolved === null || resolved === undefined) return false;
      return String(resolved).includes(String(operand));
    case 'not_contains':
      if (Array.isArray(resolved)) return !resolved.includes(operand);
      // A missing field does not contain the operand → not_contains is true.
      if (resolved === null || resolved === undefined) return true;
      return !String(resolved).includes(String(operand));
    case 'starts_with':
      if (resolved === null || resolved === undefined) return false;
      return String(resolved).startsWith(String(operand));
    case 'ends_with':
      if (resolved === null || resolved === undefined) return false;
      return String(resolved).endsWith(String(operand));
    case 'in':
      return arrayIncludes(operand, resolved);
    case 'not_in':
      return !arrayIncludes(operand, resolved);
    case 'exists':
      return resolved !== undefined && resolved !== null;
    case 'not_exists':
      return resolved === undefined || resolved === null;
    default:
      // Unknown operator — fail closed.
      return false;
  }
}

/** Type guard: a member of a group is a nested group (vs. a leaf rule). */
function isGroup(node: ConditionRule | ConditionGroup): node is ConditionGroup {
  return 'rules' in node && Array.isArray((node as ConditionGroup).rules);
}

function evaluateRule(
  rule: ConditionRule,
  context: Record<string, unknown>,
): boolean {
  const resolved = resolveField(context, rule.field);
  return applyOperator(rule.operator, resolved, rule.value);
}

/**
 * Evaluate a condition tree against a context.
 *
 * Empty-group semantics (documented and tested):
 *   - An empty AND group is true  (the AND of nothing — no rule fails).
 *   - An empty OR group is false (the OR of nothing — no rule passes).
 * This matches Array.prototype.every / .some on an empty array.
 */
export function evaluateConditions(
  group: ConditionGroup,
  context: Record<string, unknown>,
): boolean {
  const evalMember = (node: ConditionRule | ConditionGroup): boolean =>
    isGroup(node) ? evaluateConditions(node, context) : evaluateRule(node, context);

  return group.op === 'and'
    ? group.rules.every(evalMember)
    : group.rules.some(evalMember);
}
