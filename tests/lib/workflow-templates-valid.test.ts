/**
 * Every workflow template must build into a definition the schema accepts — a
 * broken starter (linear OR branching) would drop the realtor into a builder
 * that can't save. Guards the branching `hot-vs-warm-branch` template too: it
 * must produce a graph-mode definition that parses, and read as NON-linear (so
 * the Simple⇄Advanced lock is real).
 */

import { describe, it, expect } from 'vitest';
import { WORKFLOW_TEMPLATES, cloneTemplateState } from '@/components/workflows/templates';
import { buildDefinition } from '@/components/workflows/build-definition';
import { isLinearGraph } from '@/components/workflows/graph-linear-bridge';
import { parseWorkflowDefinition } from '@/lib/workflows/schema';

describe('workflow templates', () => {
  it.each(WORKFLOW_TEMPLATES.map((t) => [t.id, t] as const))(
    'template "%s" builds into a valid definition',
    (_id, template) => {
      const def = buildDefinition(cloneTemplateState(template));
      expect(() => parseWorkflowDefinition(def)).not.toThrow();
    },
  );

  it('the branching template produces a non-linear graph (Advanced-locked)', () => {
    const t = WORKFLOW_TEMPLATES.find((x) => x.id === 'hot-vs-warm-branch');
    expect(t).toBeDefined();
    const def = buildDefinition(cloneTemplateState(t!));
    expect(def.graph).toBeDefined();
    expect(isLinearGraph(def.graph!)).toBe(false);
  });
});
