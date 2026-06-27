/**
 * Deal-routing rules decide which agent gets a lead, so the cross-field
 * invariants are load-bearing: budgets must order (max >= min), EXACTLY one
 * destination is allowed (agent XOR pool — mirrors the DB CHECK), and a pool
 * tag only makes sense with a pool method. applyRuleInvariants is pure (data +
 * a RefinementCtx), so drive it with a fake ctx and assert which issues fire.
 */

import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import {
  applyRuleInvariants,
  nameField,
  priorityField,
  budgetField,
} from '@/lib/routing-rule-schema';

function issuePaths(data: unknown): string[] {
  const paths: string[] = [];
  const ctx = {
    addIssue: (i: { path?: (string | number)[] }) => paths.push(String(i.path?.[0])),
  } as unknown as z.RefinementCtx;
  applyRuleInvariants(data, ctx);
  return paths;
}

describe('applyRuleInvariants — destination XOR', () => {
  it('accepts exactly one destination (agent OR pool)', () => {
    expect(issuePaths({ destinationUserId: 'u1' })).toEqual([]);
    expect(issuePaths({ destinationPoolMethod: 'round_robin' })).toEqual([]);
  });

  it('rejects BOTH destinations set', () => {
    expect(issuePaths({ destinationUserId: 'u1', destinationPoolMethod: 'score_based' })).toContain(
      'destinationUserId',
    );
  });

  it('rejects NEITHER destination set', () => {
    expect(issuePaths({})).toContain('destinationUserId');
  });
});

describe('applyRuleInvariants — budget ordering', () => {
  it('flags maxBudget < minBudget', () => {
    expect(issuePaths({ destinationUserId: 'u1', minBudget: 5000, maxBudget: 1000 })).toContain(
      'maxBudget',
    );
  });

  it('allows max >= min (and ignores either being null)', () => {
    expect(issuePaths({ destinationUserId: 'u1', minBudget: 1000, maxBudget: 5000 })).toEqual([]);
    expect(issuePaths({ destinationUserId: 'u1', minBudget: 1000, maxBudget: null })).toEqual([]);
  });
});

describe('applyRuleInvariants — pool tag dependency', () => {
  it('rejects a pool tag paired with a specific agent', () => {
    expect(issuePaths({ destinationUserId: 'u1', destinationPoolTag: 'team-a' })).toContain(
      'destinationPoolTag',
    );
  });

  it('allows a pool tag alongside a pool method', () => {
    expect(issuePaths({ destinationPoolMethod: 'score_based', destinationPoolTag: 'team-a' })).toEqual([]);
  });
});

describe('routing-rule field validators', () => {
  it('nameField trims and bounds length', () => {
    expect(nameField.safeParse('  Hot leads  ').success).toBe(true);
    expect(nameField.safeParse('').success).toBe(false);
    expect(nameField.safeParse('x'.repeat(101)).success).toBe(false);
  });

  it('priorityField requires a non-negative integer in range', () => {
    expect(priorityField.safeParse(0).success).toBe(true);
    expect(priorityField.safeParse(1.5).success).toBe(false);
    expect(priorityField.safeParse(-1).success).toBe(false);
    expect(priorityField.safeParse(10001).success).toBe(false);
  });

  it('budgetField accepts non-negative numbers or null, rejects negatives', () => {
    expect(budgetField.safeParse(0).success).toBe(true);
    expect(budgetField.safeParse(null).success).toBe(true);
    expect(budgetField.safeParse(-1).success).toBe(false);
  });
});
