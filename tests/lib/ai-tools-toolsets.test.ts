import { describe, it, expect } from 'vitest';
import { ALL_TOOLS } from '@/lib/ai-tools/tools';
import {
  CORE_TOOL_NAMES,
  TOOLSETS,
  selectToolsets,
  getChatTools,
} from '@/lib/ai-tools/toolsets';

const ALL_NAMES = new Set(ALL_TOOLS.map((t) => t.name));

describe('toolsets — per-turn selection', () => {
  it('every CORE + TOOLSET name is a real registered tool (no typos)', () => {
    const names = [...CORE_TOOL_NAMES, ...Object.values(TOOLSETS).flat()];
    const missing = names.filter((n) => !ALL_NAMES.has(n));
    expect(missing).toEqual([]);
  });

  it('no tool is assigned to two toolsets, and none is also core', () => {
    const seen = new Map<string, string>();
    for (const n of CORE_TOOL_NAMES) seen.set(n, 'core');
    for (const [set, names] of Object.entries(TOOLSETS)) {
      for (const n of names) {
        expect(seen.has(n), `${n} already in ${seen.get(n)}`).toBe(false);
        seen.set(n, set);
      }
    }
  });

  it('every tool is reachable — getChatTools over all toolsets covers ALL_TOOLS', () => {
    // A message that trips every pattern + core + orphans must surface the
    // whole catalog. Guards against a tool silently becoming uncallable.
    const everyKeyword =
      'person deal tour property calendar send pipeline broker file plan';
    const reachable = new Set(getChatTools(everyKeyword).map((t) => t.name));
    const unreachable = [...ALL_NAMES].filter((n) => !reachable.has(n));
    expect(unreachable).toEqual([]);
  });

  it('a simple read loads core only — far fewer tools than the full catalog', () => {
    const tools = getChatTools('who are my leads');
    const names = tools.map((t) => t.name);
    expect(names).toContain('list_contacts');
    expect(names).toContain('find_person');
    // The whole point: a simple read does NOT ship the full catalog.
    expect(tools.length).toBeLessThan(ALL_TOOLS.length);
  });

  it('a tour request pulls in the tours toolset', () => {
    const names = getChatTools('schedule a tour for Sam on Friday').map((t) => t.name);
    expect(names).toContain('schedule_tour');
  });

  it('always returns a subset of ALL_TOOLS', () => {
    for (const msg of ['hello', 'who are my leads', 'send an email to Jane', '']) {
      const names = getChatTools(msg).map((t) => t.name);
      expect(names.every((n) => ALL_NAMES.has(n))).toBe(true);
    }
  });

  it('selectToolsets maps keywords to sets', () => {
    expect(selectToolsets('move the deal to closing')).toContain('deals');
    expect(selectToolsets('find a comparable property')).toContain('properties');
    expect(selectToolsets('hello there')).toEqual([]);
  });
});
