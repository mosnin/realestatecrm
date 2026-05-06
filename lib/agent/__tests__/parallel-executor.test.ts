/**
 * Manual smoke tests for parallel-executor.ts
 * Run with: npx jest lib/agent/__tests__/parallel-executor.test.ts
 */
import { buildDependencyGraph, runParallel, ParallelExecutor } from '../parallel-executor';

describe('buildDependencyGraph', () => {
  it('KR1: produces correct waves for a diamond DAG', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const deps = [
      { stepId: 'b', dependsOnStepId: 'a' },
      { stepId: 'c', dependsOnStepId: 'a' },
      { stepId: 'd', dependsOnStepId: 'b' },
      { stepId: 'd', dependsOnStepId: 'c' },
    ];
    const graph = buildDependencyGraph(steps, deps);
    expect(graph.waves[0]).toEqual(['a']);
    expect(graph.waves[1].sort()).toEqual(['b', 'c']);
    expect(graph.waves[2]).toEqual(['d']);
    expect(graph.waves).toHaveLength(3);
  });

  it('KR1: builds correct dependents map', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const deps = [
      { stepId: 'b', dependsOnStepId: 'a' },
      { stepId: 'c', dependsOnStepId: 'a' },
    ];
    const graph = buildDependencyGraph(steps, deps);
    expect(graph.dependents.get('a')?.sort()).toEqual(['b', 'c']);
    expect(graph.dependents.get('b')).toEqual([]);
    expect(graph.dependents.get('c')).toEqual([]);
  });

  it('KR4: is a pure function — deterministic across calls', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    const g1 = buildDependencyGraph(steps, deps);
    const g2 = buildDependencyGraph(steps, deps);
    expect(JSON.stringify(g1.waves)).toEqual(JSON.stringify(g2.waves));
  });

  it('KR5: zero dependencies → single wave with all steps', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const graph = buildDependencyGraph(steps, []);
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('detects circular dependencies', () => {
    const steps = [{ id: 'x' }, { id: 'y' }];
    const deps = [
      { stepId: 'x', dependsOnStepId: 'y' },
      { stepId: 'y', dependsOnStepId: 'x' },
    ];
    expect(() => buildDependencyGraph(steps, deps)).toThrow('Circular dependency detected');
  });

  it('silently ignores edges referencing unknown steps', () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'ghost' }];
    const graph = buildDependencyGraph(steps, deps);
    expect(graph.waves).toHaveLength(1); // no dependency resolved → both in wave 0
  });

  it('ignores self-loop edges', () => {
    const steps = [{ id: 'a' }];
    const deps = [{ stepId: 'a', dependsOnStepId: 'a' }];
    const graph = buildDependencyGraph(steps, deps);
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0]).toEqual(['a']);
  });
});

describe('runParallel', () => {
  it('KR2: fans out independent steps concurrently', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const start = Date.now();
    const results = await runParallel(steps, async (step) => {
      await new Promise(r => setTimeout(r, 50));
      return 'ok-' + step.id;
    });
    const elapsed = Date.now() - start;
    // 3 sequential would be ≥150ms; parallel should be well under 120ms
    expect(elapsed).toBeLessThan(120);
    expect(results).toHaveLength(3);
    expect(results.every(r => r.status === 'completed')).toBe(true);
    expect(results.every(r => (r.durationMs ?? 0) >= 45)).toBe(true);
  });

  it('KR2: executes dependency-ordered steps in correct waves', async () => {
    const order: string[] = [];
    const steps = [{ id: 'a' }, { id: 'b' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    await runParallel(steps, async (step) => {
      order.push(step.id as string);
    }, deps);
    expect(order[0]).toBe('a');
    expect(order[1]).toBe('b');
  });

  it('KR3: failed step marks direct dependents as skipped', async () => {
    const steps = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    const deps = [{ stepId: 'y', dependsOnStepId: 'x' }];
    const results = await runParallel(steps, async (step) => {
      if (step.id === 'x') throw new Error('x failed');
      return 'done';
    }, deps);
    const byId = Object.fromEntries(results.map(r => [r.stepId, r]));
    expect(byId['x'].status).toBe('failed');
    expect(byId['x'].error).toContain('x failed');
    expect(byId['y'].status).toBe('skipped');
    expect(byId['z'].status).toBe('completed'); // independent — still runs
  });

  it('KR3: skips propagate transitively through the dependency chain', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const deps = [
      { stepId: 'b', dependsOnStepId: 'a' },
      { stepId: 'c', dependsOnStepId: 'b' },
      { stepId: 'd', dependsOnStepId: 'c' },
    ];
    const results = await runParallel(steps, async (step) => {
      if (step.id === 'a') throw new Error('root failure');
      return 'ok';
    }, deps);
    const byId = Object.fromEntries(results.map(r => [r.stepId, r]));
    expect(byId['a'].status).toBe('failed');
    expect(byId['b'].status).toBe('skipped');
    expect(byId['c'].status).toBe('skipped');
    expect(byId['d'].status).toBe('skipped');
  });

  it('returns all step results including skipped', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    const results = await runParallel(steps, async () => { throw new Error('fail'); }, deps);
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.stepId).sort();
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('ParallelExecutor class', () => {
  it('KR1: graph() returns DependencyGraph', () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const deps = [{ stepId: 'b', dependsOnStepId: 'a' }];
    const executor = new ParallelExecutor(steps, deps);
    const graph = executor.graph();
    expect(graph.waves).toHaveLength(2);
    expect(graph.waves[0]).toEqual(['a']);
    expect(graph.waves[1]).toEqual(['b']);
  });

  it('KR2: run() executes all steps', async () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const executor = new ParallelExecutor(steps);
    const results = await executor.run(async (step) => 'result-' + step.id);
    expect(results).toHaveLength(3);
    expect(results.every(r => r.status === 'completed')).toBe(true);
  });

  it('KR5: zero-dependency constructor default works', () => {
    const steps = [{ id: 'a' }, { id: 'b' }];
    const executor = new ParallelExecutor(steps); // no deps arg
    const graph = executor.graph();
    expect(graph.waves).toHaveLength(1);
    expect(graph.waves[0].sort()).toEqual(['a', 'b']);
  });
});
