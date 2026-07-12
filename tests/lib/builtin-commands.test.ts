/**
 * Composer built-in slash commands — /goal must always be present, share the
 * SkillItem contract, and expand with a selectable placeholder so the realtor
 * types their outcome straight over it.
 */

import { describe, it, expect } from 'vitest';
import { BUILTIN_COMMANDS, expandSkillPrompt } from '@/components/ui/chippi-prompt-box';

describe('BUILTIN_COMMANDS', () => {
  it('includes /goal with the full SkillItem shape', () => {
    const goal = BUILTIN_COMMANDS.find((c) => c.slug === 'goal');
    expect(goal).toBeDefined();
    expect(goal!.title.length).toBeGreaterThan(0);
    expect(goal!.description.length).toBeGreaterThan(0);
    expect(goal!.prompt.length).toBeGreaterThan(20);
  });

  it('every PROMPT command expands with a selectable placeholder (action commands are exempt)', () => {
    for (const cmd of BUILTIN_COMMANDS.filter((c) => !c.action)) {
      const { text, selStart, selEnd } = expandSkillPrompt(cmd.prompt);
      expect(text).not.toContain('{');
      expect(text).not.toContain('}');
      // The selection must be a real, non-empty range the realtor overtypes.
      expect(selEnd).toBeGreaterThan(selStart);
    }
  });

  it('action commands declare an action and skip prompt injection', () => {
    for (const cmd of BUILTIN_COMMANDS.filter((c) => c.action)) {
      expect(cmd.action!.length).toBeGreaterThan(0);
      expect(cmd.prompt).toBe('');
    }
  });

  it('slugs are unique and lowercase (menu + icon-map keys)', () => {
    const slugs = BUILTIN_COMMANDS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toBe(s.toLowerCase());
  });
});
