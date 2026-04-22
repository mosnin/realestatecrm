/**
 * Skill registry — a simple name → Skill map backed by a validated array.
 *
 * All skills get validated against the live tool registry at module-load
 * time, so a skill that declares a typo in its toolAllowlist (or sneaks
 * in a mutating tool) throws loudly during boot rather than silently at
 * first invocation.
 */

import { ALL_TOOLS } from '../tools';
import { contactResearcherSkill } from './contact-researcher';
import { pipelineAnalystSkill } from './pipeline-analyst';
import { validateSkill, type Skill } from './types';

export const ALL_SKILLS: Skill[] = [
  validateSkill(contactResearcherSkill, ALL_TOOLS),
  validateSkill(pipelineAnalystSkill, ALL_TOOLS),
];

const bySkillName = new Map<string, Skill>(ALL_SKILLS.map((s) => [s.name, s]));

export function getSkill(name: string): Skill | undefined {
  return bySkillName.get(name);
}

export function listSkills(): Skill[] {
  return ALL_SKILLS;
}
