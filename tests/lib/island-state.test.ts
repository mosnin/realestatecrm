/**
 * The Island's display-state reducer — behavioral tests.
 *
 * Everything the pill decides (what to show, when success retreats, when
 * failures persist, how dismissals behave) is pure logic in
 * components/island/island-state.ts; these tests drive it with realistic
 * WorkSession rows and clock values and assert on the derived state.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveIslandState,
  trackTerminalTransitions,
  isSessionDismissed,
  formatElapsed,
  jumpInHref,
  SUCCESS_LINGER_MS,
  FRESH_FAILURE_WINDOW_MS,
  type IslandSessionRow,
} from '@/components/island/island-state';

const T0 = Date.parse('2026-07-14T15:00:00.000Z');

function session(overrides: Partial<IslandSessionRow> = {}): IslandSessionRow {
  return {
    id: 'ws-1',
    spaceId: 'space-1',
    conversationId: null,
    goal: 'Research comps for 412 Elm',
    autonomy: 'plan_first',
    allowQuestions: true,
    status: 'running',
    plan: [],
    question: null,
    answer: null,
    findings: [],
    artifactFileId: null,
    artifactName: null,
    summary: null,
    error: null,
    createdAt: new Date(T0 - 60_000).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    completedAt: null,
    ...overrides,
  };
}

function derive(
  sessions: IslandSessionRow[],
  opts: {
    dismissed?: Record<string, string>;
    terminalSeenAt?: Record<string, number>;
    now?: number;
  } = {},
) {
  return deriveIslandState({
    sessions,
    dismissed: opts.dismissed ?? {},
    terminalSeenAt: opts.terminalSeenAt ?? {},
    now: opts.now ?? T0,
  });
}

describe('deriveIslandState — hidden baseline', () => {
  it('hides with no sessions at all', () => {
    expect(derive([]).mode).toBe('hidden');
  });

  it('hides when only stale terminal sessions exist (never observed live)', () => {
    const done = session({ status: 'completed', summary: 'All set.' });
    const state = derive([done]); // no terminalSeenAt entry
    expect(state.mode).toBe('hidden');
  });

  it('ignores cancelled sessions entirely', () => {
    const cancelled = session({ status: 'cancelled' });
    expect(derive([cancelled], { terminalSeenAt: { 'ws-1': T0 } }).mode).toBe('hidden');
  });
});

describe('deriveIslandState — active work', () => {
  it('shows a running session with the live step title as the status line', () => {
    const s = session({
      plan: [
        { id: 'p1', title: 'Pull recent sales', status: 'done' },
        { id: 'p2', title: 'Researching comps for 412 Elm', status: 'running' },
        { id: 'p3', title: 'Write the summary', status: 'pending' },
      ],
    });
    const state = derive([s]);
    expect(state.mode).toBe('active');
    expect(state.tone).toBe('working');
    expect(state.statusLine).toBe('Researching comps for 412 Elm');
    expect(state.doneCount).toBe(1);
    expect(state.totalCount).toBe(3);
    expect(state.moreCount).toBe(0);
  });

  it('falls back to the goal when no step is running yet', () => {
    const state = derive([session({ plan: [] })]);
    expect(state.statusLine).toBe('Research comps for 412 Elm');
  });

  it('labels planning explicitly', () => {
    const state = derive([session({ status: 'planning' })]);
    expect(state.statusLine).toBe('Planning: Research comps for 412 Elm');
    expect(state.tone).toBe('working');
  });

  it('surfaces attention states over plain work when multiple sessions run', () => {
    const running = session({ id: 'ws-run' });
    const asking = session({
      id: 'ws-ask',
      status: 'awaiting_input',
      question: 'Which zip code should I prioritize?',
      createdAt: new Date(T0 - 300_000).toISOString(), // older, still wins
    });
    const state = derive([running, asking]);
    expect(state.session?.id).toBe('ws-ask');
    expect(state.tone).toBe('attention');
    expect(state.statusLine).toBe('Has a question for you');
    expect(state.detailLine).toBe('Which zip code should I prioritize?');
    expect(state.moreCount).toBe(1);
  });

  it('prefers the newer session between two plain-running ones', () => {
    const older = session({ id: 'ws-old', createdAt: new Date(T0 - 600_000).toISOString() });
    const newer = session({ id: 'ws-new', createdAt: new Date(T0 - 30_000).toISOString() });
    expect(derive([older, newer]).session?.id).toBe('ws-new');
  });

  it('reports elapsed time from createdAt, ticking with now', () => {
    const s = session({ createdAt: new Date(T0 - 95_000).toISOString() });
    expect(derive([s], { now: T0 }).elapsedMs).toBe(95_000);
    expect(derive([s], { now: T0 + 5_000 }).elapsedMs).toBe(100_000);
  });

  it('degrades to no elapsed time when the row lacks createdAt', () => {
    expect(derive([session({ createdAt: null })]).elapsedMs).toBeNull();
  });
});

describe('deriveIslandState — success lingers ~6s, then retreats', () => {
  const done = session({
    status: 'completed',
    summary: 'Found 6 solid comps; report saved to Files.',
    completedAt: new Date(T0).toISOString(),
  });

  it('shows a success state with the outcome line while fresh', () => {
    const state = derive([done], { terminalSeenAt: { 'ws-1': T0 }, now: T0 + 2_000 });
    expect(state.mode).toBe('success');
    expect(state.tone).toBe('success');
    expect(state.statusLine).toBe('Found 6 solid comps; report saved to Files.');
    expect(state.expiresAtMs).toBe(T0 + SUCCESS_LINGER_MS);
  });

  it('retreats once the linger window elapses', () => {
    const state = derive([done], {
      terminalSeenAt: { 'ws-1': T0 },
      now: T0 + SUCCESS_LINGER_MS,
    });
    expect(state.mode).toBe('hidden');
  });

  it('uses a goal-derived outcome line when there is no summary', () => {
    const bare = session({ status: 'completed', summary: null });
    const state = derive([bare], { terminalSeenAt: { 'ws-1': T0 }, now: T0 + 1_000 });
    expect(state.statusLine).toBe('Done — Research comps for 412 Elm');
  });

  it('freezes elapsed at the run duration instead of ticking forever', () => {
    const state = derive([done], { terminalSeenAt: { 'ws-1': T0 }, now: T0 + 4_000 });
    expect(state.elapsedMs).toBe(60_000); // completedAt - createdAt, not now - createdAt
  });

  it('live work outranks a lingering success', () => {
    const running = session({ id: 'ws-2' });
    const state = derive([done, running], { terminalSeenAt: { 'ws-1': T0 }, now: T0 + 1_000 });
    expect(state.mode).toBe('active');
    expect(state.session?.id).toBe('ws-2');
  });
});

describe('deriveIslandState — failures are honest and sticky', () => {
  const failed = session({
    status: 'failed',
    error: 'MLS lookup timed out after 3 retries.',
  });

  it('shows a failure with the error detail', () => {
    const state = derive([failed], { terminalSeenAt: { 'ws-1': T0 }, now: T0 + 1_000 });
    expect(state.mode).toBe('failure');
    expect(state.tone).toBe('failure');
    expect(state.statusLine).toBe("Couldn't finish — Research comps for 412 Elm");
    expect(state.detailLine).toBe('MLS lookup timed out after 3 retries.');
  });

  it('does NOT auto-retreat — failures persist well past the success window', () => {
    const state = derive([failed], {
      terminalSeenAt: { 'ws-1': T0 },
      now: T0 + SUCCESS_LINGER_MS * 20,
    });
    expect(state.mode).toBe('failure');
    expect(state.expiresAtMs).toBeNull();
  });

  it('hides only once dismissed', () => {
    const state = derive([failed], {
      terminalSeenAt: { 'ws-1': T0 },
      dismissed: { 'ws-1': 'failed' },
      now: T0 + 1_000,
    });
    expect(state.mode).toBe('hidden');
  });
});

describe('dismissal semantics', () => {
  it('dismissing while running hides the session while it keeps working', () => {
    const s = session({ status: 'running' });
    expect(derive([s], { dismissed: { 'ws-1': 'running' } }).mode).toBe('hidden');
  });

  it('a dismissed-while-running session resurfaces when it needs the realtor', () => {
    const asking = session({ status: 'awaiting_input', question: 'Which lender?' });
    const state = derive([asking], { dismissed: { 'ws-1': 'running' } });
    expect(state.mode).toBe('active');
    expect(state.tone).toBe('attention');
  });

  it('a dismissed-while-running session resurfaces when it finishes', () => {
    const done = session({ status: 'completed', summary: 'Done.' });
    const state = derive([done], {
      dismissed: { 'ws-1': 'running' },
      terminalSeenAt: { 'ws-1': T0 },
      now: T0 + 1_000,
    });
    expect(state.mode).toBe('success');
  });

  it('dismissing a finished session keeps every terminal display hidden', () => {
    const done = session({ status: 'completed' });
    expect(isSessionDismissed({ 'ws-1': 'completed' }, done)).toBe(true);
    const failedLater = session({ status: 'failed' });
    expect(isSessionDismissed({ 'ws-1': 'completed' }, failedLater)).toBe(true);
  });
});

describe('trackTerminalTransitions — when outcomes count as "seen"', () => {
  it('records a live active→completed transition', () => {
    const done = session({ status: 'completed' });
    const seen = trackTerminalTransitions({}, { 'ws-1': 'running' }, [done], T0);
    expect(seen['ws-1']).toBe(T0);
  });

  it('returns the same reference when nothing changed (React-state friendly)', () => {
    const prev = { 'ws-1': T0 - 1_000 };
    const done = session({ status: 'completed' });
    const seen = trackTerminalTransitions(prev, { 'ws-1': 'completed' }, [done], T0);
    expect(seen).toBe(prev);
  });

  it('does not replay a success ceremony for work finished before page load', () => {
    const done = session({ status: 'completed' });
    const seen = trackTerminalTransitions({}, {}, [done], T0); // no previous status
    expect(seen['ws-1']).toBeUndefined();
  });

  it('surfaces a fresh failure discovered cold', () => {
    const failed = session({
      status: 'failed',
      updatedAt: new Date(T0 - 60_000).toISOString(),
    });
    const seen = trackTerminalTransitions({}, {}, [failed], T0);
    expect(seen['ws-1']).toBe(T0);
  });

  it('leaves stale failures to the workspace strip', () => {
    const failed = session({
      status: 'failed',
      updatedAt: new Date(T0 - FRESH_FAILURE_WINDOW_MS - 1_000).toISOString(),
      completedAt: null,
    });
    const seen = trackTerminalTransitions({}, {}, [failed], T0);
    expect(seen['ws-1']).toBeUndefined();
  });

  it('never overwrites an existing seen timestamp', () => {
    const prev = { 'ws-1': T0 - 5_000 };
    const done = session({ status: 'completed' });
    const seen = trackTerminalTransitions(prev, { 'ws-1': 'running' }, [done], T0);
    expect(seen['ws-1']).toBe(T0 - 5_000);
  });
});

describe('helpers', () => {
  it('formats elapsed time compactly', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(45_000)).toBe('45s');
    expect(formatElapsed(192_000)).toBe('3m 12s');
    expect(formatElapsed(3_840_000)).toBe('1h 04m');
  });

  it('links Jump in to the session conversation when there is one', () => {
    expect(jumpInHref('acme', session({ conversationId: 'conv-9' }))).toBe(
      '/s/acme/chippi?conversationId=conv-9',
    );
    expect(jumpInHref('acme', session())).toBe('/s/acme/chippi');
  });
});
