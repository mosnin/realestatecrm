/**
 * First-class lead organization on Contact — parse, merge, apply.
 *
 * These filters must map onto the existing contact model (never a parallel
 * CRM) and must not escape the authorized space when `owner` is foreign.
 */

import { describe, it, expect } from 'vitest';
import {
  parseLeadOrgFilters,
  mergeSavedViewFilters,
  applyLeadOrgFilters,
  CONTACT_ARCHIVE_UNTIL,
  LEAD_ORG_EMPTY_ID,
  type LeadOrgQuery,
} from '@/lib/leads/org-filters';

type Call = { op: string; args: unknown[] };

function recordingQuery() {
  const calls: Call[] = [];
  const q: LeadOrgQuery = {
    eq: (a, b) => {
      calls.push({ op: 'eq', args: [a, b] });
      return q;
    },
    contains: (a, b) => {
      calls.push({ op: 'contains', args: [a, b] });
      return q;
    },
    or: (a) => {
      calls.push({ op: 'or', args: [a] });
      return q;
    },
    is: (a, b) => {
      calls.push({ op: 'is', args: [a, b] });
      return q;
    },
    gt: (a, b) => {
      calls.push({ op: 'gt', args: [a, b] });
      return q;
    },
    gte: (a, b) => {
      calls.push({ op: 'gte', args: [a, b] });
      return q;
    },
    lt: (a, b) => {
      calls.push({ op: 'lt', args: [a, b] });
      return q;
    },
    lte: (a, b) => {
      calls.push({ op: 'lte', args: [a, b] });
      return q;
    },
  };
  return { q, calls };
}

const SCOPE = { spaceId: 'space_1', ownerId: 'owner_1' };

describe('parseLeadOrgFilters', () => {
  it('maps first-class params onto Contact columns and drops unknown values', () => {
    const params = new URLSearchParams({
      stage: 'TOUR',
      segment: 'buyer',
      tag: 'hot-spring',
      source: 'referral',
      status: 'archived',
      scoreLabel: 'hot',
      list: 'view_1',
      owner: 'owner_1',
    });
    expect(parseLeadOrgFilters(params)).toEqual({
      stage: 'TOUR',
      segment: 'buyer',
      tag: 'hot-spring',
      source: 'referral',
      status: 'archived',
      scoreLabel: 'hot',
      list: 'view_1',
      owner: 'owner_1',
    });
  });

  it('accepts type/leadType aliases and comma-separated tags', () => {
    const params = new URLSearchParams({
      type: 'APPLICATION',
      leadType: 'seller',
      tags: 'a,b',
    });
    expect(parseLeadOrgFilters(params)).toEqual({
      stage: 'APPLICATION',
      segment: 'seller',
      tag: 'a',
      tags: ['b'],
    });
  });

  it('ignores ALL / junk so a bad query cannot invent a filter', () => {
    const params = new URLSearchParams({
      type: 'ALL',
      stage: 'NOT_A_STAGE',
      segment: 'prospect',
      source: 'carrier_pigeon',
      status: 'won',
    });
    expect(parseLeadOrgFilters(params)).toEqual({});
  });
});

describe('mergeSavedViewFilters', () => {
  it('fills from a People saved-view payload; request params win', () => {
    const merged = mergeSavedViewFilters(
      { stage: 'TOUR' },
      { typeFilter: 'QUALIFICATION', leadTypeFilter: 'buyer', tagFilter: 'vip', source: 'manual' },
    );
    expect(merged.stage).toBe('TOUR'); // request wins
    expect(merged.segment).toBe('buyer');
    expect(merged.tag).toBe('vip');
    expect(merged.source).toBe('manual');
  });

  it('maps leadTypeFilter=new onto the existing new-lead tag', () => {
    const merged = mergeSavedViewFilters({}, { leadTypeFilter: 'new' });
    expect(merged.tag).toBe('new-lead');
    expect(merged.segment).toBeUndefined();
  });
});

describe('applyLeadOrgFilters', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('applies stage/segment/source/tag onto existing Contact columns', () => {
    const { q, calls } = recordingQuery();
    applyLeadOrgFilters(
      q,
      { stage: 'TOUR', segment: 'buyer', source: 'referral', tag: 'vip' },
      SCOPE,
      now,
    );
    expect(calls).toEqual([
      { op: 'eq', args: ['type', 'TOUR'] },
      { op: 'eq', args: ['leadType', 'buyer'] },
      { op: 'eq', args: ['source', 'referral'] },
      { op: 'contains', args: ['tags', ['vip']] },
    ]);
  });

  it('maps status=archived onto the shared snooze sentinel (no new column)', () => {
    const { q, calls } = recordingQuery();
    applyLeadOrgFilters(q, { status: 'archived' }, SCOPE, now);
    expect(calls).toEqual([{ op: 'gte', args: ['snoozedUntil', CONTACT_ARCHIVE_UNTIL] }]);
  });

  it('maps status=active onto the default People snooze hide', () => {
    const { q, calls } = recordingQuery();
    applyLeadOrgFilters(q, { status: 'active' }, SCOPE, now);
    expect(calls).toEqual([
      { op: 'or', args: [`snoozedUntil.is.null,snoozedUntil.lte.${now.toISOString()}`] },
    ]);
  });

  it('treats a matching owner as a no-op (ownership IS the space)', () => {
    const { q, calls } = recordingQuery();
    applyLeadOrgFilters(q, { owner: 'owner_1' }, SCOPE, now);
    expect(calls).toEqual([]);
    applyLeadOrgFilters(q, { owner: 'space_1' }, SCOPE, now);
    expect(calls).toEqual([]);
  });

  it('never leaves the space when owner is a foreign tenant — empty match only', () => {
    const { q, calls } = recordingQuery();
    applyLeadOrgFilters(q, { owner: 'other_space', stage: 'TOUR' }, SCOPE, now);
    expect(calls[0]).toEqual({ op: 'eq', args: ['id', LEAD_ORG_EMPTY_ID] });
    expect(calls.some((c) => c.op === 'eq' && c.args[0] === 'spaceId')).toBe(false);
    expect(calls).toContainEqual({ op: 'eq', args: ['type', 'TOUR'] });
  });
});
