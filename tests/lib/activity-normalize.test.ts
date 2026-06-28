/**
 * Activity NORMALIZER tests — pure functions, no mocks needed.
 *
 * Asserts each source maps to the right kind/status/tone/title, that no raw
 * payload column leaks into title/summary, and that the ContactActivity filter
 * EXCLUDES plain manual notes while INCLUDING agent/workflow-origin rows.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeAgentAction,
  normalizeAgentDispatch,
  normalizeDraft,
  normalizeWorkflowRun,
  normalizeScheduledMessage,
  normalizeIntegrationEvent,
  normalizeRoutineRun,
  normalizeOutboundMessage,
} from '@/lib/activity/normalize';

describe('normalizeAgentAction', () => {
  it('humanizes actionType, maps completed→success/green, carries deal link', () => {
    const item = normalizeAgentAction({
      id: 'a1',
      actionType: 'send_follow_up',
      outcome: 'completed',
      reasoning: 'Lead went quiet for 3 days',
      relatedDealId: 'deal-1',
      relatedContactId: 'c-1',
      createdAt: '2026-06-01T10:00:00.000Z',
    });
    expect(item.id).toBe('agent_action:a1');
    expect(item.kind).toBe('agent_action');
    expect(item.title).toBe('Send Follow Up');
    expect(item.status).toBe('success');
    expect(item.tone).toBe('green');
    expect(item.summary).toBe('Lead went quiet for 3 days');
    expect(item.link).toEqual({ kind: 'deal', id: 'deal-1' });
  });

  it('maps queued_for_approval→pending/amber and suggested→info/muted', () => {
    expect(normalizeAgentAction({ id: 'a', outcome: 'queued_for_approval' }).status).toBe('pending');
    expect(normalizeAgentAction({ id: 'a', outcome: 'queued_for_approval' }).tone).toBe('amber');
    expect(normalizeAgentAction({ id: 'a', outcome: 'suggested' }).status).toBe('info');
    expect(normalizeAgentAction({ id: 'a', outcome: 'suggested' }).tone).toBe('muted');
    expect(normalizeAgentAction({ id: 'a', outcome: 'failed' }).status).toBe('failed');
    expect(normalizeAgentAction({ id: 'a', outcome: 'failed' }).tone).toBe('rose');
  });
});

describe('normalizeAgentDispatch', () => {
  it('maps confirmed→success and dispatched/in_flight→pending', () => {
    expect(normalizeAgentDispatch({ id: 'r', status: 'confirmed', trigger: 'sweep' }).status).toBe('success');
    expect(normalizeAgentDispatch({ id: 'r', status: 'dispatched' }).status).toBe('pending');
    expect(normalizeAgentDispatch({ id: 'r', status: 'in_flight' }).status).toBe('pending');
  });

  it('surfaces failureReason only on failure, never anything else', () => {
    const ok = normalizeAgentDispatch({ id: 'r', status: 'confirmed', failureReason: 'should not show' });
    expect(ok.summary).toBeUndefined();
    const bad = normalizeAgentDispatch({ id: 'r', status: 'failed', failureReason: 'timeout' });
    expect(bad.status).toBe('failed');
    expect(bad.summary).toBe('timeout');
  });
});

describe('normalizeDraft', () => {
  it('titles "Drafted a {channel}", maps sent→success, pending→pending, dismissed→skipped', () => {
    const item = normalizeDraft({
      id: 'd1',
      channel: 'sms',
      status: 'sent',
      subject: 'Quick question',
      contactId: 'c-9',
    });
    expect(item.id).toBe('draft:d1');
    expect(item.kind).toBe('draft');
    expect(item.title).toBe('Drafted a text');
    expect(item.status).toBe('success');
    expect(item.channel).toBe('sms');
    expect(item.link).toEqual({ kind: 'contact', id: 'c-9' });
    expect(normalizeDraft({ id: 'd', channel: 'email', status: 'pending' }).status).toBe('pending');
    expect(normalizeDraft({ id: 'd', channel: 'email', status: 'dismissed' }).status).toBe('skipped');
  });
});

describe('normalizeWorkflowRun', () => {
  it('uses summary as title or falls back to "Workflow ran"', () => {
    expect(normalizeWorkflowRun({ id: 'w', status: 'completed', summary: 'Tagged 3 leads' }).title).toBe(
      'Tagged 3 leads',
    );
    expect(normalizeWorkflowRun({ id: 'w', status: 'completed' }).title).toBe('Workflow ran');
  });

  it('maps running→pending, failed→failed with error summary, skipped→skipped', () => {
    expect(normalizeWorkflowRun({ id: 'w', status: 'running' }).status).toBe('pending');
    const failed = normalizeWorkflowRun({ id: 'w', status: 'failed', error: 'boom', workflowId: 'wf-1' });
    expect(failed.status).toBe('failed');
    expect(failed.summary).toBe('boom');
    expect(failed.relatedWorkflowId).toBe('wf-1');
    expect(failed.link).toEqual({ kind: 'workflow', id: 'wf-1' });
    expect(normalizeWorkflowRun({ id: 'w', status: 'skipped' }).status).toBe('skipped');
  });
});

describe('normalizeScheduledMessage', () => {
  it('titles "Sent a {channel}" on sent, maps sending→pending, canceled→skipped', () => {
    const sent = normalizeScheduledMessage({
      id: 's1',
      channel: 'email',
      status: 'sent',
      instruction: 'Send the comps',
      recipientContactId: 'c-2',
    });
    expect(sent.id).toBe('scheduled_message:s1');
    expect(sent.title).toBe('Sent a email');
    expect(sent.status).toBe('success');
    expect(sent.link).toEqual({ kind: 'contact', id: 'c-2' });
    expect(normalizeScheduledMessage({ id: 's', channel: 'sms', status: 'sending' }).status).toBe('pending');
    expect(normalizeScheduledMessage({ id: 's', channel: 'sms', status: 'drafted' }).title).toBe('Drafted a text');
    expect(normalizeScheduledMessage({ id: 's', channel: 'sms', status: 'canceled' }).status).toBe('skipped');
  });
});

describe('normalizeIntegrationEvent', () => {
  it('uses title/actor, toolkit, maps captured→info, dispatched→pending, failed→failed', () => {
    const item = normalizeIntegrationEvent({
      id: 'e1',
      toolkit: 'gmail',
      eventType: 'GMAIL_NEW_GMAIL_MESSAGE',
      title: 'New email from Jane',
      actor: 'jane@x.com',
      snippet: 'Hi, about the listing…',
      status: 'captured',
    });
    expect(item.id).toBe('integration_event:e1');
    expect(item.title).toBe('New email from Jane');
    expect(item.summary).toBe('Hi, about the listing…');
    expect(item.toolkit).toBe('gmail');
    expect(item.status).toBe('info');
    expect(item.tone).toBe('muted');
    expect(item.link).toEqual({ kind: 'integrations' });
    expect(normalizeIntegrationEvent({ id: 'e', status: 'dispatched' }).status).toBe('pending');
    expect(normalizeIntegrationEvent({ id: 'e', status: 'failed' }).status).toBe('failed');
    expect(normalizeIntegrationEvent({ id: 'e', status: 'skipped' }).status).toBe('skipped');
  });

  it('does NOT leak the raw payload into title/summary', () => {
    const item = normalizeIntegrationEvent({
      id: 'e2',
      eventType: 'GMAIL_NEW_GMAIL_MESSAGE',
      title: 'Safe title',
      snippet: 'safe snippet',
      // a hostile raw payload — must never appear in user-facing text
      ...({ payload: { secret: 'TOP_SECRET_TOKEN' } } as Record<string, unknown>),
    });
    expect(JSON.stringify(item)).not.toContain('TOP_SECRET_TOKEN');
  });
});

describe('normalizeRoutineRun', () => {
  it('titles "Routine ran", maps ok→success, error→failed, links to routines', () => {
    const item = normalizeRoutineRun({
      id: 'rt1',
      instruction: 'Review hot leads each morning',
      lastRunStatus: 'ok',
      lastRunAt: '2026-06-01T13:00:00.000Z',
    });
    expect(item.id).toBe('routine_run:rt1');
    expect(item.title).toBe('Routine ran');
    expect(item.summary).toBe('Review hot leads each morning');
    expect(item.status).toBe('success');
    expect(item.link).toEqual({ kind: 'routines', id: 'rt1' });
    expect(normalizeRoutineRun({ id: 'rt', lastRunStatus: 'error' }).status).toBe('failed');
  });
});

describe('normalizeOutboundMessage (ContactActivity filter)', () => {
  it('EXCLUDES a plain manual note (no agent/workflow metadata)', () => {
    expect(
      normalizeOutboundMessage({ id: 'ca1', type: 'note', content: 'Called, left vm', metadata: null }),
    ).toBeNull();
    expect(
      normalizeOutboundMessage({ id: 'ca2', type: 'note', content: 'Met at open house', metadata: { manualLog: true } }),
    ).toBeNull();
  });

  it('INCLUDES an agent-origin row (metadata.source) and a workflow row (metadata.via)', () => {
    const agent = normalizeOutboundMessage({
      id: 'ca3',
      type: 'email',
      content: 'Sent: Your comps',
      contactId: 'c-7',
      metadata: { source: 'background_agent', body: 'SECRET_BODY' },
    });
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe('outbound_message:ca3');
    expect(agent!.kind).toBe('outbound_message');
    expect(agent!.title).toBe('Sent a email');
    expect(agent!.status).toBe('success');
    expect(agent!.link).toEqual({ kind: 'contact', id: 'c-7' });
    // raw body in metadata must not leak
    expect(JSON.stringify(agent)).not.toContain('SECRET_BODY');

    const workflow = normalizeOutboundMessage({
      id: 'ca4',
      type: 'follow_up',
      content: 'Follow up scheduled',
      metadata: { via: 'workflow_scheduled_auto' },
    });
    expect(workflow).not.toBeNull();
    expect(workflow!.status).toBe('pending');
  });
});
