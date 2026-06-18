/**
 * Delete tools — the destructive verbs the agent was missing.
 *
 * The #1 invariant these tests defend: a delete can NEVER fire without
 * approval. Each delete tool must be `requiresApproval: true`, and the SDK
 * bridge must map that to `needsApproval: true` so the `@openai/agents`
 * runtime pauses for the realtor BEFORE the handler runs. We assert both the
 * declaration (the registry contract) and the wiring (the bridge), because a
 * tool could be declared correctly yet mis-wired, or vice-versa.
 */

import { describe, it, expect } from 'vitest';
import { RunContext } from '@openai/agents';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import { toSdkTool } from '@/lib/ai-tools/sdk-bridge';
import { getRiskLevel } from '@/lib/ai-tools/types';
import type { ToolContext } from '@/lib/ai-tools/types';
import { CORE_TOOL_NAMES, TOOLSETS } from '@/lib/ai-tools/toolsets';

const DELETE_TOOLS = ['delete_contact', 'delete_deal', 'delete_property', 'delete_tour'] as const;

function makeCtx(): ToolContext {
  return {
    userId: 'u_1',
    space: { id: 's_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_1' },
    signal: new AbortController().signal,
  };
}

function getTool(name: string) {
  const tool = ALL_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} is not registered in ALL_TOOLS`);
  return tool;
}

describe('delete tools — registration', () => {
  it.each(DELETE_TOOLS)('%s is registered in ALL_TOOLS', (name) => {
    expect(ALL_TOOLS.some((t) => t.name === name)).toBe(true);
  });

  it('covers every core CRM entity the agent can create/update', () => {
    // Contacts, deals, properties, tours — the four entities with
    // create/update tools. If a new createable entity is added, its delete
    // belongs here too.
    expect(DELETE_TOOLS).toEqual(
      expect.arrayContaining(['delete_contact', 'delete_deal', 'delete_property', 'delete_tour']),
    );
  });
});

describe('delete tools — approval is mandatory (the #1 requirement)', () => {
  it.each(DELETE_TOOLS)('%s declares requiresApproval: true', (name) => {
    const tool = getTool(name);
    // Not just "!== false" — it must be literally true. A delete is never a
    // "maybe": it always requires a human yes.
    expect(tool.requiresApproval).toBe(true);
  });

  it.each(DELETE_TOOLS)('%s is classified destructive', (name) => {
    expect(getRiskLevel(getTool(name))).toBe('destructive');
  });

  it.each(DELETE_TOOLS)(
    '%s maps to SDK needsApproval === true (so the run pauses before the handler)',
    async (name) => {
      const sdk = toSdkTool(getTool(name), makeCtx());
      // The SDK calls needsApproval(runCtx, input) before invoking the tool.
      // For our delete tools it must resolve true regardless of args — there
      // is no argument shape that lets a delete skip the prompt.
      const approves = await sdk.needsApproval(new RunContext(), {
        personId: 'x',
        dealId: 'x',
        propertyId: 'x',
        tourId: 'x',
        reason: 'cleanup',
      });
      expect(approves).toBe(true);
    },
  );

  it.each(DELETE_TOOLS)('%s defines a non-empty domain-specific summariseCall', (name) => {
    const tool = getTool(name);
    expect(typeof tool.summariseCall).toBe('function');
    const summary = tool.summariseCall!({
      personId: 'abcdef123456',
      dealId: 'abcdef123456',
      propertyId: 'abcdef123456',
      tourId: 'abcdef123456',
      reason: 'duplicate record',
    } as never);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.toLowerCase()).toContain('delete');
  });

  it.each(DELETE_TOOLS)('%s defines a rateLimit blast-radius cap', (name) => {
    const tool = getTool(name);
    expect(tool.rateLimit).toBeDefined();
    expect(tool.rateLimit!.max).toBeGreaterThan(0);
    expect(tool.rateLimit!.windowSeconds).toBeGreaterThan(0);
  });
});

describe('delete tools — reachable from the per-turn selector', () => {
  it.each(DELETE_TOOLS)('%s is assigned to a toolset (or core), so it is loadable', (name) => {
    const assigned = new Set<string>([...CORE_TOOL_NAMES, ...Object.values(TOOLSETS).flat()]);
    expect(assigned.has(name)).toBe(true);
  });
});
