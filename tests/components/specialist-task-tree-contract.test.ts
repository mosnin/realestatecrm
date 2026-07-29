import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cancelSpecialistTask,
  displayedMemberStatus,
  shouldHydrateAfterStreamEvent,
  subagentTaskReducer,
} from '@/components/ai/blocks/subagent-task-block-view';
import { cancelSwarmFromMonitor } from '@/app/s/[slug]/swarm/[runId]/cancel-swarm-button';

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('inline specialist task tree product contract', () => {
  it('hydrates a completed member, applies live output, and preserves it when the parent cancels', () => {
    const base = {
      status: 'running' as const,
      members: {},
      thinking: {},
      result: null,
      error: null,
      connected: true,
      hydrated: false,
    };
    const member = {
      id: 'member-1',
      swarmRunId: 'run-1',
      customAgentId: null,
      name: 'Pricing specialist',
      role: 'Pricing',
      systemPrompt: '',
      task: 'Analyze comps',
      status: 'running' as const,
      output: null,
      wave: 1,
      costCents: 0,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-07-29T12:00:00Z',
    };
    const hydrated = subagentTaskReducer(base, {
      type: 'hydrate',
      run: {
        id: 'run-1',
        spaceId: 'space-1',
        goal: 'Prepare a listing strategy',
        status: 'running',
        plan: null,
        result: null,
        errorMessage: null,
        totalCostCents: 0,
        createdAt: '2026-07-29T12:00:00Z',
        completedAt: null,
      },
      members: [member],
    });
    const completed = subagentTaskReducer(hydrated, {
      type: 'agent_completed',
      data: { memberId: 'member-1', output: 'Price near $500k' },
    });
    const cancelled = subagentTaskReducer(completed, {
      type: 'swarm_cancelled',
      data: {},
    });

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.members['member-1']).toMatchObject({
      status: 'completed',
      output: 'Price near $500k',
    });
  });

  it('hydrates a persisted terminal tree and combined result without SSE replay', () => {
    const state = subagentTaskReducer(
      {
        status: 'queued',
        members: {},
        thinking: {},
        result: null,
        error: null,
        connected: false,
        hydrated: false,
      },
      {
        type: 'hydrate',
        run: {
          id: 'run-1',
          spaceId: 'space-1',
          goal: 'Prepare a listing strategy',
          status: 'completed',
          plan: null,
          result: 'Use a $499k list price and launch Friday.',
          errorMessage: null,
          totalCostCents: 0,
          createdAt: '2026-07-29T12:00:00Z',
          completedAt: '2026-07-29T12:01:00Z',
        },
        members: [
          {
            id: 'member-1',
            swarmRunId: 'run-1',
            customAgentId: null,
            name: 'Pricing specialist',
            role: 'Pricing',
            systemPrompt: '',
            task: 'Analyze comps',
            status: 'completed',
            output: 'Price near $500k',
            wave: 1,
            costCents: 0,
            startedAt: null,
            completedAt: null,
            createdAt: '2026-07-29T12:00:00Z',
          },
          {
            id: 'member-2',
            swarmRunId: 'run-1',
            customAgentId: null,
            name: 'Launch specialist',
            role: 'Marketing',
            systemPrompt: '',
            task: 'Plan the launch',
            status: 'completed',
            output: 'Launch Friday',
            wave: 1,
            costCents: 0,
            startedAt: null,
            completedAt: null,
            createdAt: '2026-07-29T12:00:00Z',
          },
        ],
      },
    );

    expect(state.status).toBe('completed');
    expect(Object.values(state.members)).toHaveLength(2);
    expect(state.members['member-1']?.output).toBe('Price near $500k');
    expect(state.result).toBe('Use a $499k list price and launch Friday.');
    expect(state.connected).toBe(false);
  });

  it('fills terminal output when completion lands between initial hydration and SSE connection', () => {
    const initial = subagentTaskReducer(
      {
        status: 'queued',
        members: {},
        thinking: {},
        result: null,
        error: null,
        connected: false,
        hydrated: false,
      },
      {
        type: 'hydrate',
        run: {
          id: 'run-1',
          spaceId: 'space-1',
          goal: 'Prepare a listing strategy',
          status: 'running',
          plan: null,
          result: null,
          errorMessage: null,
          totalCostCents: 0,
          createdAt: '2026-07-29T12:00:00Z',
          completedAt: null,
        },
        members: [],
      },
    );
    const connectedTerminal = subagentTaskReducer(initial, {
      type: 'connected',
      data: { status: 'completed' },
    });
    const completedMember = {
      id: 'member-1',
      swarmRunId: 'run-1',
      customAgentId: null,
      name: 'Pricing specialist',
      role: 'Pricing',
      systemPrompt: '',
      task: 'Analyze comps',
      status: 'completed' as const,
      output: 'Price near $500k',
      wave: 1,
      costCents: 0,
      startedAt: null,
      completedAt: '2026-07-29T12:01:00Z',
      createdAt: '2026-07-29T12:00:00Z',
    };
    const authoritative = subagentTaskReducer(connectedTerminal, {
      type: 'hydrate',
      run: {
        id: 'run-1',
        spaceId: 'space-1',
        goal: 'Prepare a listing strategy',
        status: 'completed',
        plan: null,
        result: 'Use a $499k list price and launch Friday.',
        errorMessage: null,
        totalCostCents: 0,
        createdAt: '2026-07-29T12:00:00Z',
        completedAt: '2026-07-29T12:01:00Z',
      },
      members: [completedMember],
    });

    expect(shouldHydrateAfterStreamEvent('connected', { status: 'completed' })).toBe(true);
    expect(connectedTerminal.status).toBe('completed');
    expect(connectedTerminal.result).toBeNull();
    expect(authoritative.status).toBe('completed');
    expect(authoritative.result).toBe('Use a $499k list price and launch Friday.');
    expect(authoritative.members['member-1']).toEqual(completedMember);
    expect(authoritative.connected).toBe(false);
  });

  it('does not let delayed hydration downgrade a live terminal specialist result', () => {
    const state = {
      status: 'running' as const,
      members: {
        'member-1': {
          id: 'member-1',
          swarmRunId: 'run-1',
          customAgentId: null,
          name: 'Pricing specialist',
          role: 'Pricing',
          systemPrompt: '',
          task: 'Analyze comps',
          status: 'completed' as const,
          output: 'Live terminal result',
          wave: 1,
          costCents: 0,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-07-29T12:00:00Z',
        },
      },
      thinking: {},
      result: null,
      error: null,
      connected: true,
      hydrated: true,
    };
    const hydrated = subagentTaskReducer(state, {
      type: 'hydrate',
      run: {
        id: 'run-1',
        spaceId: 'space-1',
        goal: 'Prepare a listing strategy',
        status: 'running',
        plan: null,
        result: null,
        errorMessage: null,
        totalCostCents: 0,
        createdAt: '2026-07-29T12:00:00Z',
        completedAt: null,
      },
      members: [
        {
          ...state.members['member-1'],
          status: 'running',
          output: null,
        },
      ],
    });

    expect(hydrated.members['member-1']).toMatchObject({
      status: 'completed',
      output: 'Live terminal result',
    });
  });

  it('preserves live members absent from a partial hydration snapshot', () => {
    const state = {
      status: 'running' as const,
      members: {
        first: {
          id: 'first',
          swarmRunId: 'run-1',
          customAgentId: null,
          name: 'First specialist',
          role: null,
          systemPrompt: '',
          task: 'First task',
          status: 'completed' as const,
          output: 'Terminal first result',
          wave: 1,
          costCents: 0,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-07-29T12:00:00Z',
        },
        second: {
          id: 'second',
          swarmRunId: 'run-1',
          customAgentId: null,
          name: 'Second specialist',
          role: null,
          systemPrompt: '',
          task: 'Second task',
          status: 'running' as const,
          output: null,
          wave: 1,
          costCents: 0,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-07-29T12:00:00Z',
        },
      },
      thinking: {},
      result: null,
      error: null,
      connected: true,
      hydrated: true,
    };
    const hydrated = subagentTaskReducer(state, {
      type: 'hydrate',
      run: {
        id: 'run-1',
        spaceId: 'space-1',
        goal: 'Goal',
        status: 'running',
        plan: null,
        result: null,
        errorMessage: null,
        totalCostCents: 0,
        createdAt: '2026-07-29T12:00:00Z',
        completedAt: null,
      },
      members: [{ ...state.members.first, status: 'running', output: null }],
    });

    expect(Object.keys(hydrated.members)).toEqual(['first', 'second']);
    expect(hydrated.members.first).toMatchObject({
      status: 'completed',
      output: 'Terminal first result',
    });
    expect(hydrated.members.second.status).toBe('running');
  });

  it('rehydrates terminal truth when completion wins the cancel race', async () => {
    const hydrate = async () => 'completed' as const;
    let hydrated = 0;
    const status = await cancelSpecialistTask(
      'run-1',
      async () => {
        hydrated += 1;
        return hydrate();
      },
      (async () =>
        new Response(JSON.stringify({ error: 'Run finished before cancellation' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    );

    expect(status).toBe('completed');
    expect(hydrated).toBe(1);
  });

  it('keeps completed parent state and outcome absorbing after late active updates', () => {
    const terminal = {
      status: 'completed' as const,
      members: {},
      thinking: {},
      result: 'Accepted combined outcome',
      error: null,
      connected: false,
      hydrated: true,
    };
    const lateActions = [
      { type: 'connected' as const, data: { status: 'running' } },
      { type: 'swarm_planning' as const, data: {} },
      { type: 'agent_started' as const, data: { memberId: 'late', name: 'Late' } },
      { type: 'audit_started' as const, data: {} },
    ];
    const afterEvents = lateActions.reduce(subagentTaskReducer, terminal);
    const afterHydrate = subagentTaskReducer(afterEvents, {
      type: 'hydrate',
      run: {
        id: 'run-1',
        spaceId: 'space-1',
        goal: 'Goal',
        status: 'running',
        plan: null,
        result: null,
        errorMessage: null,
        totalCostCents: 0,
        createdAt: '2026-07-29T12:00:00Z',
        completedAt: null,
      },
      members: [],
    });

    expect(afterHydrate.status).toBe('completed');
    expect(afterHydrate.result).toBe('Accepted combined outcome');
    expect(afterHydrate.connected).toBe(false);
  });

  it('keeps cancelled parent state absorbing while accepting useful late member output', () => {
    const member = {
      id: 'member-1',
      swarmRunId: 'run-1',
      customAgentId: null,
      name: 'Pricing specialist',
      role: 'Pricing',
      systemPrompt: '',
      task: 'Analyze comps',
      status: 'running' as const,
      output: null,
      wave: 1,
      costCents: 0,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-07-29T12:00:00Z',
    };
    const cancelled = {
      status: 'cancelled' as const,
      members: { 'member-1': member },
      thinking: {},
      result: null,
      error: null,
      connected: false,
      hydrated: true,
    };
    const withLateOutput = subagentTaskReducer(cancelled, {
      type: 'agent_completed',
      data: { memberId: 'member-1', output: 'Finished before cancellation committed' },
    });
    const afterLatePlan = subagentTaskReducer(withLateOutput, {
      type: 'plan_created',
      data: { memberId: 'member-2', name: 'Late plan item' },
    });

    expect(afterLatePlan.status).toBe('cancelled');
    expect(afterLatePlan.members['member-1']?.output).toContain('Finished before cancellation');
    expect(afterLatePlan.connected).toBe(false);
  });

  it('renders nonterminal persisted members as stopped under a cancelled parent', () => {
    const member = {
      id: 'member-1',
      swarmRunId: 'run-1',
      customAgentId: null,
      name: 'Pricing specialist',
      role: null,
      systemPrompt: '',
      task: 'Analyze comps',
      status: 'running' as const,
      output: null,
      wave: 1,
      costCents: 0,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-07-29T12:00:00Z',
    };
    expect(displayedMemberStatus(member, 'cancelled')).toBe('cancelled');
  });

  it('refreshes the standalone monitor when its cancel read loses to completion', async () => {
    let refreshes = 0;
    const outcome = await cancelSwarmFromMonitor(
      'run-1',
      () => {
        refreshes += 1;
      },
      (async () =>
        new Response(JSON.stringify({ status: 'completed', rehydrate: true }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    );

    expect(outcome).toBe('terminal');
    expect(refreshes).toBe(1);
  });

  it('starts from the persisted conversation block and hydrates the durable run', () => {
    const stream = read('lib/ai-tools/sdk-chat-stream.ts');
    const card = read('components/ai/blocks/subagent-task-block-view.tsx');

    expect(stream).toContain("type: 'subagent_task'");
    expect(stream).toContain('runId,');
    expect(card).toContain('fetch(`/api/swarm/${block.runId}`');
    expect(card).toContain("cache: 'no-store'");
  });

  it('shows specialists, their tasks/results, safe stop, and a combined outcome inline', () => {
    const card = read('components/ai/blocks/subagent-task-block-view.tsx');

    expect(card).toContain('Specialists');
    expect(card).toContain('{member.task}');
    expect(card).toContain('{member.output}');
    expect(card).toContain('Stop all specialists');
    expect(card).toContain('Combined outcome');
    expect(card).toContain('already inside a model call may finish');
  });
});
