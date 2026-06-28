/**
 * Unit tests for `planTriggerReconcile` — the PURE decision at the heart of the
 * subscription reconcile. Given what enabled integration_event workflows want,
 * the first active connection per toolkit, and the active trigger slugs per
 * connection, it decides what to subscribe / what's already ok / what can't be
 * healed (no active connection). No IO is exercised here — just the set math.
 */

import { describe, it, expect } from 'vitest';
import {
  planTriggerReconcile,
  type WantedTrigger,
} from '@/lib/integrations/reconcile-workflow-triggers';

describe('planTriggerReconcile', () => {
  it('already-subscribed pair → alreadyOk, not in toSubscribe', () => {
    const wanted: WantedTrigger[] = [{ toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' }];
    const conns = new Map([['gmail', { id: 'conn-1' }]]);
    const slugs = new Map([['conn-1', new Set(['GMAIL_NEW_GMAIL_MESSAGE'])]]);

    const plan = planTriggerReconcile(wanted, conns, slugs);

    expect(plan.alreadyOk).toBe(1);
    expect(plan.toSubscribe).toHaveLength(0);
    expect(plan.notConnected).toHaveLength(0);
  });

  it('connected app but slug NOT subscribed → toSubscribe with the right connectionId', () => {
    const wanted: WantedTrigger[] = [{ toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' }];
    const conns = new Map([['gmail', { id: 'conn-1' }]]);
    // Connection has some OTHER active slug, but not the wanted one.
    const slugs = new Map([['conn-1', new Set(['GMAIL_SOMETHING_ELSE'])]]);

    const plan = planTriggerReconcile(wanted, conns, slugs);

    expect(plan.toSubscribe).toEqual([
      { connectionId: 'conn-1', toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' },
    ]);
    expect(plan.alreadyOk).toBe(0);
    expect(plan.notConnected).toHaveLength(0);
  });

  it('toolkit with no active connection → notConnected', () => {
    const wanted: WantedTrigger[] = [{ toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' }];
    const conns = new Map<string, { id: string }>(); // nothing connected
    const slugs = new Map<string, Set<string>>();

    const plan = planTriggerReconcile(wanted, conns, slugs);

    expect(plan.notConnected).toEqual([
      { toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' },
    ]);
    expect(plan.toSubscribe).toHaveLength(0);
    expect(plan.alreadyOk).toBe(0);
  });

  it('duplicate wanted pairs are de-duped', () => {
    const wanted: WantedTrigger[] = [
      { toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' },
      { toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' },
      { toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' },
    ];
    const conns = new Map([['gmail', { id: 'conn-1' }]]);
    const slugs = new Map([['conn-1', new Set<string>()]]);

    const plan = planTriggerReconcile(wanted, conns, slugs);

    expect(plan.toSubscribe).toHaveLength(1);
    expect(plan.toSubscribe[0]).toEqual({
      connectionId: 'conn-1',
      toolkit: 'gmail',
      event: 'GMAIL_NEW_GMAIL_MESSAGE',
    });
  });

  it('multiple toolkits route to the right connections', () => {
    const wanted: WantedTrigger[] = [
      { toolkit: 'gmail', event: 'GMAIL_NEW_GMAIL_MESSAGE' },
      { toolkit: 'slack', event: 'SLACK_DIRECT_MESSAGE_RECEIVED' },
      { toolkit: 'hubspot', event: 'HUBSPOT_CONTACT_CREATED_TRIGGER' },
    ];
    const conns = new Map([
      ['gmail', { id: 'gmail-conn' }],
      ['slack', { id: 'slack-conn' }],
      // hubspot intentionally not connected
    ]);
    const slugs = new Map([
      // gmail already subscribed
      ['gmail-conn', new Set(['GMAIL_NEW_GMAIL_MESSAGE'])],
      // slack missing the wanted slug
      ['slack-conn', new Set<string>()],
    ]);

    const plan = planTriggerReconcile(wanted, conns, slugs);

    expect(plan.alreadyOk).toBe(1); // gmail
    expect(plan.toSubscribe).toEqual([
      { connectionId: 'slack-conn', toolkit: 'slack', event: 'SLACK_DIRECT_MESSAGE_RECEIVED' },
    ]);
    expect(plan.notConnected).toEqual([
      { toolkit: 'hubspot', event: 'HUBSPOT_CONTACT_CREATED_TRIGGER' },
    ]);
  });
});
