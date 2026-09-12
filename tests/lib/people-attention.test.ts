import { describe, expect, it } from 'vitest';
import { comparePeopleAttention, personAttention } from '@/lib/people-attention';
const now = Date.parse('2026-09-08T12:00:00Z');
const person = { createdAt: '2026-09-01', tags: [], leadScore: 95 };
describe('People attention', () => {
  it('puts an overdue commitment before an otherwise hot lead', () => {
    const overdue = {...person, leadScore: 10, followUpAt:'2026-09-08T10:00:00Z'};
    expect([person, overdue].sort((a,b)=>comparePeopleAttention(a,b,now))[0]).toBe(overdue);
  });
  it('does not infer a reply needed from a missing contact timestamp', () => {
    expect(personAttention(person,now).reason).toBeNull();
  });
  it('recognizes new leads without inventing delivery', () => {
    expect(personAttention({...person,tags:['new-lead']},now).reason).toContain('no contact logged');
  });
});
