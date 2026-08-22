import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkActivityEvent } from '@/lib/ai-tools/events';
import {
  MAX_VISIBLE_WORK_ACTIVITIES,
  selectVisibleWorkActivities,
  WorkActivityTimeline,
  workActivityDisclosureStatus,
  workActivityStatusLabel,
} from '@/components/chippi/work-activity-timeline';

function event(
  overrides: Partial<WorkActivityEvent> & Pick<WorkActivityEvent, 'phase' | 'status' | 'label'>,
): WorkActivityEvent {
  return {
    type: 'work_activity',
    seq: overrides.seq ?? 0,
    ts: overrides.ts ?? '2026-08-13T12:00:00.000Z',
    workId: overrides.workId ?? 'work_current',
    ...overrides,
  };
}

describe('WorkActivityTimeline normalization', () => {
  it('shows only the current work turn and replaces superseded lifecycle receipts', () => {
    const visible = selectVisibleWorkActivities([
      event({ workId: 'work_old', phase: 'terminal', status: 'completed', label: 'Old work finished' }),
      event({ phase: 'context', status: 'active', label: 'Preparing workspace context' }),
      event({ phase: 'context', status: 'completed', label: 'Workspace context ready' }),
      event({ phase: 'tool', status: 'active', label: 'Running send email', toolCallId: 'call_1' }),
      event({ phase: 'tool', status: 'completed', label: 'Send email finished', toolCallId: 'call_1' }),
    ]);

    expect(visible.map((item) => item.label)).toEqual([
      'Send email finished',
    ]);
  });

  it('hides request, workspace, and model receipts', () => {
    const visible = selectVisibleWorkActivities([
      event({ phase: 'request', status: 'completed', label: 'Request received' }),
      event({ phase: 'context', status: 'completed', label: 'Workspace context ready' }),
      event({ phase: 'provider', status: 'active', label: 'Model activity started' }),
      event({ phase: 'tool', status: 'completed', label: 'Pipeline summary finished', toolName: 'pipeline_summary' }),
    ]);
    expect(visible.map((item) => item.label)).toEqual(['Pipeline summary finished']);
  });

  it('collapses retries of the same tool into one receipt', () => {
    const visible = selectVisibleWorkActivities([
      event({
        phase: 'tool',
        status: 'failed',
        label: 'Pipeline summary failed',
        toolCallId: 'call_1',
        toolName: 'pipeline_summary',
      }),
      event({
        phase: 'tool',
        status: 'failed',
        label: 'Pipeline summary failed',
        toolCallId: 'call_2',
        toolName: 'pipeline_summary',
      }),
      event({
        phase: 'tool',
        status: 'completed',
        label: 'Find deal finished',
        toolCallId: 'call_3',
        toolName: 'find_deal',
      }),
    ]);
    expect(visible.map((item) => item.toolName)).toEqual(['pipeline_summary', 'find_deal']);
  });

  it('bounds tool-heavy turns to the most recent visible receipts', () => {
    const events = Array.from({ length: MAX_VISIBLE_WORK_ACTIVITIES + 5 }, (_, index) =>
      event({
        seq: index,
        phase: 'tool',
        status: 'completed',
        label: `Tool ${index} finished`,
        toolCallId: `call_${index}`,
      }),
    );

    const visible = selectVisibleWorkActivities(events);
    expect(visible).toHaveLength(MAX_VISIBLE_WORK_ACTIVITIES);
    expect(visible[0]?.label).toBe('Tool 5 finished');
    expect(visible.at(-1)?.label).toBe('Tool 12 finished');
  });

  it('uses honest active copy without marking an older started boundary complete', () => {
    expect(workActivityStatusLabel('active', false)).toBe('Started');
    expect(workActivityStatusLabel('active', true)).toBe('Working');
    expect(workActivityStatusLabel('paused', true)).toBe('Paused');
    expect(workActivityStatusLabel('failed', true)).toBe('Failed');
  });

  it('stays open until a grounded terminal receipt arrives', () => {
    expect(workActivityDisclosureStatus([
      event({ phase: 'plan', status: 'completed', label: 'Plan ready', planStepCount: 3 }),
    ])).toBe('working');
    expect(workActivityDisclosureStatus([
      event({ phase: 'plan', status: 'completed', label: 'Plan ready', planStepCount: 3 }),
      event({ phase: 'terminal', status: 'completed', label: 'Work turn finished' }),
    ])).toBe('complete');
  });
});

describe('WorkActivityTimeline presentation contract', () => {
  it('uses a transparent inline surface and an accessible, single-update live region', () => {
    const html = renderToStaticMarkup(createElement(WorkActivityTimeline, {
      events: [event({ phase: 'tool', status: 'active', label: 'Running contact search' })],
    }));

    expect(html).toContain('data-agent-surface-style="inline"');
    expect(html).toContain('border-y border-border/45 bg-transparent');
    expect(html).not.toContain('bg-card');
    expect(html).toContain('aria-live="polite"');
    expect(html.match(/aria-live=/g)).toHaveLength(1);
    expect(html).toContain('Running contact search');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-agent-activity-status="working"');
    expect(html).not.toContain('aria-label="Grounded work progress"');
  });

  it('collapses a completed run into its grounded terminal summary', () => {
    const html = renderToStaticMarkup(createElement(WorkActivityTimeline, {
      events: [
        event({ phase: 'tool', status: 'completed', label: 'Contact search finished' }),
        event({ phase: 'terminal', status: 'completed', label: 'Work turn finished' }),
      ],
    }));

    expect(html).toContain('data-agent-activity-status="complete"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Work turn finished');
  });

  it('shows a grounded plan count without fabricating individual todo rows', () => {
    const html = renderToStaticMarkup(createElement(WorkActivityTimeline, {
      events: [event({
        phase: 'plan',
        status: 'active',
        label: 'Preparing 3 plan steps',
        planStepCount: 3,
        toolCallId: 'call_plan',
      })],
    }));

    expect(html).toContain('Preparing 3 plan steps');
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/<li/g)).toBeNull();
  });
});
