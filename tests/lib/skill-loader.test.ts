/**
 * SKILL.md loader — the `/`-menu wiring.
 *
 * Verifies that user-invocable skills parse their `title`/`prompt`/`order`
 * frontmatter, sort by `order`, and that a skill is offered in the menu iff
 * it declares BOTH a title and a prompt. Also covers the composer's
 * {placeholder} expansion, which decides where the realtor's cursor lands.
 *
 * The loader reads the real SKILL.md files from disk, so this also fails
 * loudly if a shipped skill's frontmatter is malformed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSkillDefinitions,
  loadUserInvocableSkills,
  __resetSkillCacheForTests,
} from '@/lib/ai-tools/skills/loader';
import { expandSkillPrompt } from '@/components/ui/chippi-prompt-box';

beforeEach(() => {
  __resetSkillCacheForTests();
});

describe('loadUserInvocableSkills', () => {
  it('returns every skill that declares both a title and a prompt', () => {
    const skills = loadUserInvocableSkills();
    expect(skills.length).toBeGreaterThanOrEqual(5);
    for (const s of skills) {
      expect(s.slug).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.prompt).toBeTruthy();
    }
  });

  it('orders skills by the frontmatter `order` field', () => {
    const slugs = loadUserInvocableSkills().map((s) => s.slug);
    // pipeline-analyst is order 1; contact-researcher 3; planner 5.
    expect(slugs.indexOf('pipeline-analyst')).toBeLessThan(
      slugs.indexOf('contact-researcher'),
    );
    expect(slugs.indexOf('contact-researcher')).toBeLessThan(
      slugs.indexOf('planner'),
    );
  });

  it('offers a skill in the menu iff it has both a title and a prompt', () => {
    const menu = new Set(loadUserInvocableSkills().map((s) => s.slug));
    for (const d of loadSkillDefinitions()) {
      const shouldBeInMenu = Boolean(d.frontmatter.title && d.frontmatter.prompt);
      expect(menu.has(d.slug)).toBe(shouldBeInMenu);
    }
  });
});

describe('expandSkillPrompt', () => {
  it('unwraps a {placeholder} and selects its inner text', () => {
    const r = expandSkillPrompt('Research {a contact} now.');
    expect(r.text).toBe('Research a contact now.');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('a contact');
  });

  it('places the cursor at the end when there is no placeholder', () => {
    const r = expandSkillPrompt('Triage my pipeline.');
    expect(r.text).toBe('Triage my pipeline.');
    expect(r.selStart).toBe(r.text.length);
    expect(r.selEnd).toBe(r.text.length);
  });

  it('handles a placeholder at the very end of the prompt', () => {
    const r = expandSkillPrompt('Plan this: {the task}');
    expect(r.text).toBe('Plan this: the task');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('the task');
    expect(r.selEnd).toBe(r.text.length);
  });

  it('leaves a malformed brace pair (close before open) untouched', () => {
    const r = expandSkillPrompt('weird } { order');
    expect(r.text).toBe('weird } { order');
    expect(r.selStart).toBe(r.text.length);
    expect(r.selEnd).toBe(r.text.length);
  });

  it('expands the real shipped skill prompts without leaving a brace behind', () => {
    for (const s of loadUserInvocableSkills()) {
      const r = expandSkillPrompt(s.prompt);
      expect(r.text).not.toContain('{');
      expect(r.text).not.toContain('}');
      expect(r.selStart).toBeLessThanOrEqual(r.selEnd);
      expect(r.selEnd).toBeLessThanOrEqual(r.text.length);
    }
  });
});
