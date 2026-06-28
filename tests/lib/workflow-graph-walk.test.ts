/**
 * Unit tests for walkGraph — the pure branching traversal.
 *
 * Injected `evaluate` / `runAction` keep this DB-free: we assert the WALK (which
 * nodes run, in what order, which branch is taken, terminal status), and trust
 * runWorkflow to persist the returned steps. The graphs here are already-valid
 * (Phase 1 schema guarantees), so the walk can assume structural soundness.
 */

import { describe, it, expect, vi } from 'vitest';
import { walkGraph, type GraphActionResult } from '@/lib/workflows/graph-walk';
import type { WorkflowAction, WorkflowGraph } from '@/lib/workflows/schema';

const draft = (instruction = 'hi'): WorkflowAction => ({
  type: 'draft_message',
  config: { channel: 'sms', instruction },
});

const okAction = async (): Promise<GraphActionResult> => ({ status: 'ok' });

describe('walkGraph — linear', () => {
  it('runs a trigger → A1 → A2 chain in order (parity with the linear path)', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft('first') },
        { id: 'a2', kind: 'action', action: draft('second') },
      ],
      edges: [
        { from: 't', to: 'a1' },
        { from: 'a1', to: 'a2' },
      ],
    };
    const ran: string[] = [];
    const res = await walkGraph(graph, {
      evaluate: () => true,
      runAction: async (a) => {
        ran.push((a.config as { instruction: string }).instruction);
        return { status: 'ok' };
      },
    });
    expect(ran).toEqual(['first', 'second']);
    expect(res.steps.map((s) => s.kind)).toEqual(['action', 'action']);
    expect(res.status).toBe('completed');
  });

  it('reports failed when an action fails', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft() },
      ],
      edges: [{ from: 't', to: 'a1' }],
    };
    const res = await walkGraph(graph, {
      evaluate: () => true,
      runAction: async () => ({ status: 'failed', detail: { error: 'boom' } }),
    });
    expect(res.status).toBe('failed');
    expect(res.steps[0]).toMatchObject({ kind: 'action', status: 'failed' });
  });
});

describe('walkGraph — branching', () => {
  const branchGraph: WorkflowGraph = {
    nodes: [
      { id: 't', kind: 'trigger' },
      { id: 'c', kind: 'condition', condition: { op: 'and', rules: [{ field: 'lead.score', operator: 'gte', value: 80 }] } },
      { id: 'hot', kind: 'action', action: draft('hot path') },
      { id: 'warm', kind: 'action', action: draft('warm path') },
    ],
    edges: [
      { from: 't', to: 'c' },
      { from: 'c', to: 'hot', branch: 'true' },
      { from: 'c', to: 'warm', branch: 'false' },
    ],
  };

  it('takes the TRUE branch and skips the false one', async () => {
    const ran: string[] = [];
    const res = await walkGraph(branchGraph, {
      evaluate: () => true,
      runAction: async (a) => {
        ran.push((a.config as { instruction: string }).instruction);
        return { status: 'ok' };
      },
    });
    expect(ran).toEqual(['hot path']);
    expect(res.steps.map((s) => s.kind)).toEqual(['condition', 'action']);
    expect(res.steps[0].detail).toMatchObject({ passed: true, branch: 'true' });
  });

  it('takes the FALSE branch and skips the true one', async () => {
    const ran: string[] = [];
    await walkGraph(branchGraph, {
      evaluate: () => false,
      runAction: async (a) => {
        ran.push((a.config as { instruction: string }).instruction);
        return { status: 'ok' };
      },
    });
    expect(ran).toEqual(['warm path']);
  });

  it('runs a fan-out (two actions off the trigger) in edge order', async () => {
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'a1', kind: 'action', action: draft('one') },
        { id: 'a2', kind: 'action', action: draft('two') },
      ],
      edges: [
        { from: 't', to: 'a1' },
        { from: 't', to: 'a2' },
      ],
    };
    const ran: string[] = [];
    await walkGraph(graph, {
      evaluate: () => true,
      runAction: async (a) => {
        ran.push((a.config as { instruction: string }).instruction);
        return { status: 'ok' };
      },
    });
    expect(ran).toEqual(['one', 'two']);
  });

  it('runs a diamond-join tail exactly once', async () => {
    // t → c → (true → a1)(false → a2); both a1 and a2 → join. With TRUE taken,
    // only a1 runs, then join once.
    const graph: WorkflowGraph = {
      nodes: [
        { id: 't', kind: 'trigger' },
        { id: 'c', kind: 'condition', condition: { op: 'and', rules: [] } },
        { id: 'a1', kind: 'action', action: draft('a1') },
        { id: 'a2', kind: 'action', action: draft('a2') },
        { id: 'join', kind: 'action', action: draft('join') },
      ],
      edges: [
        { from: 't', to: 'c' },
        { from: 'c', to: 'a1', branch: 'true' },
        { from: 'c', to: 'a2', branch: 'false' },
        { from: 'a1', to: 'join' },
        { from: 'a2', to: 'join' },
      ],
    };
    const ran: string[] = [];
    await walkGraph(graph, {
      evaluate: () => true,
      runAction: async (a) => {
        ran.push((a.config as { instruction: string }).instruction);
        return { status: 'ok' };
      },
    });
    expect(ran).toEqual(['a1', 'join']);
    expect(ran.filter((x) => x === 'join')).toHaveLength(1);
  });

  it('evaluate is only called for condition nodes', async () => {
    const evaluate = vi.fn(() => true);
    await walkGraph(branchGraph, { evaluate, runAction: okAction });
    expect(evaluate).toHaveBeenCalledTimes(1);
  });
});
