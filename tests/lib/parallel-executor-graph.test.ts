/**
 * buildDependencyGraph is the pure Kahn topological sort behind parallel step
 * execution: it groups steps into ordered "waves" (everything in wave N can run
 * concurrently once wave N-1 is done) and a reverse-adjacency `dependents` map
 * used to propagate skips on failure. Pin the wave ordering, the dependents map,
 * defensive edge handling (unknown refs / self-loops ignored), and the cycle
 * throw — a regression here serializes parallel work or deadlocks it.
 */

import { describe, it, expect } from 'vitest';
import { buildDependencyGraph } from '@/lib/agent/parallel-executor';

const steps = (...ids: string[]) => ids.map((id) => ({ id }));
const dep = (stepId: string, dependsOnStepId: string) => ({ stepId, dependsOnStepId });

describe('buildDependencyGraph', () => {
  it('puts every independent step in a single first wave', () => {
    const g = buildDependencyGraph(steps('a', 'b', 'c'), []);
    expect(g.waves).toHaveLength(1);
    expect(new Set(g.waves[0])).toEqual(new Set(['a', 'b', 'c']));
  });

  it('orders dependent steps into successive waves', () => {
    // a -> b -> c (c depends on b, b depends on a)
    const g = buildDependencyGraph(steps('a', 'b', 'c'), [dep('b', 'a'), dep('c', 'b')]);
    expect(g.waves).toEqual([['a'], ['b'], ['c']]);
  });

  it('runs siblings sharing a prerequisite in the same wave', () => {
    // a -> b, a -> c : b and c both wait only on a
    const g = buildDependencyGraph(steps('a', 'b', 'c'), [dep('b', 'a'), dep('c', 'a')]);
    expect(g.waves[0]).toEqual(['a']);
    expect(new Set(g.waves[1])).toEqual(new Set(['b', 'c']));
  });

  it('builds the reverse-adjacency dependents map', () => {
    const g = buildDependencyGraph(steps('a', 'b', 'c'), [dep('b', 'a'), dep('c', 'a')]);
    expect(new Set(g.dependents.get('a'))).toEqual(new Set(['b', 'c']));
    expect(g.dependents.get('b')).toEqual([]);
  });

  it('ignores edges referencing unknown steps and self-loops', () => {
    const g = buildDependencyGraph(steps('a', 'b'), [
      dep('b', 'ghost'), // unknown prerequisite -> ignored
      dep('zzz', 'a'), // unknown dependent -> ignored
      dep('a', 'a'), // self-loop -> ignored
    ]);
    // no real edges survived -> both independent
    expect(g.waves).toHaveLength(1);
    expect(new Set(g.waves[0])).toEqual(new Set(['a', 'b']));
  });

  it('throws on a circular dependency', () => {
    expect(() => buildDependencyGraph(steps('a', 'b'), [dep('a', 'b'), dep('b', 'a')])).toThrow(/circular/i);
  });

  it('handles an empty step list', () => {
    const g = buildDependencyGraph([], []);
    expect(g.waves).toEqual([]);
    expect(g.dependents.size).toBe(0);
  });
});
