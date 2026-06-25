/**
 * Anti-slop voice linter tests.
 *
 * These pin the detector that the runtime self-critique relies on: if a
 * prompt change quietly stops catching "I hope this email finds you well",
 * this suite goes red before the slop ships. Two halves:
 *   - positive: each tell category is detected on a representative phrase.
 *   - negative: legitimate realtor voice is NOT flagged (false positives
 *     trigger needless rewrites, which is the slop we are avoiding).
 */

import { describe, it, expect } from 'vitest';
import {
  detectSlop,
  hasSlop,
  slopScore,
  summarizeSlop,
} from '@/lib/voice/slop';

describe('detectSlop — catches the tells', () => {
  it('flags em dashes', () => {
    const f = detectSlop('Sounds good — talk soon.');
    expect(f.map((x) => x.category)).toContain('em-dash');
  });

  it('flags AI self-reference', () => {
    expect(detectSlop('As an AI, I cannot feel excitement.').some((f) => f.category === 'ai-self-reference')).toBe(true);
    expect(detectSlop("I'm just an assistant here to help.").some((f) => f.category === 'ai-self-reference')).toBe(true);
  });

  it('flags stock corporate openers', () => {
    expect(hasSlop('I hope this email finds you well. Quick update on your offer.')).toBe(true);
    expect(hasSlop('I wanted to reach out about the inspection.')).toBe(true);
    expect(hasSlop("I'm reaching out to follow up on Tuesday.")).toBe(true);
    expect(hasSlop('I hope you are doing well!')).toBe(true);
  });

  it('flags assistant filler enthusiasm', () => {
    expect(hasSlop('Great question. The closing date is the 14th.')).toBe(true);
    expect(hasSlop("I'd be happy to send those comps over.")).toBe(true);
    expect(hasSlop('Happy to help with the paperwork.')).toBe(true);
    expect(hasSlop('Certainly! Here are the next steps.')).toBe(true);
    expect(hasSlop('Absolutely! That works for me.')).toBe(true);
  });

  it('flags hollow sign-offs', () => {
    expect(hasSlop('Let me know if you have any questions.')).toBe(true);
    expect(hasSlop("Please don't hesitate to reach out.")).toBe(true);
    expect(hasSlop('Feel free to reach out anytime.')).toBe(true);
    expect(hasSlop('Looking forward to hearing from you.')).toBe(true);
  });

  it('flags hedging', () => {
    expect(hasSlop("It's worth noting that rates moved this week.")).toBe(true);
    expect(hasSlop("I think it's important to consider the timeline.")).toBe(true);
  });

  it('flags buzzword padding', () => {
    expect(hasSlop("In today's fast-paced market, timing matters.")).toBe(true);
    expect(hasSlop('At the end of the day, the offer is strong.')).toBe(true);
  });

  it('reports multiple distinct tells in one message', () => {
    const text =
      'I hope this email finds you well. Great question — I would be happy to help. Let me know if you have any questions.';
    const cats = new Set(detectSlop(text).map((f) => f.category));
    expect(cats.has('corporate-opener')).toBe(true);
    expect(cats.has('filler-enthusiasm')).toBe(true);
    expect(cats.has('hollow-signoff')).toBe(true);
    expect(cats.has('em-dash')).toBe(true);
  });

  it('dedupes a phrase repeated twice', () => {
    const f = detectSlop('Happy to help. Truly, happy to help.');
    expect(f.filter((x) => x.category === 'filler-enthusiasm')).toHaveLength(1);
  });
});

describe('detectSlop — leaves real realtor voice alone', () => {
  const clean = [
    'Wanted to circle back on the Chen deal. Free for a 15-min call this week?',
    'Called David. He wants to revisit pricing next week.',
    "The seller countered at 1.2M. I think we hold at 1.15M and ask for the appliances. Want me to draft it?",
    'Tuesday at 3 works. I will bring the disclosure packet. See you there.',
    'Got your voicemail. The inspection is booked for Friday morning, 9am.',
    'Quick yes from me on the extension. I will send the addendum today.',
  ];

  for (const text of clean) {
    it(`clean: ${text.slice(0, 40)}...`, () => {
      expect(detectSlop(text)).toEqual([]);
    });
  }

  it('does not flag "I think" used as a normal opinion', () => {
    expect(hasSlop('I think we should counter at 1.15M.')).toBe(false);
  });

  it('does not flag "reach out" without the canned framing', () => {
    expect(hasSlop('I will reach out to the lender tomorrow.')).toBe(false);
  });
});

describe('slopScore + helpers', () => {
  it('scores clean text 0 and saturates at 1', () => {
    expect(slopScore('Tuesday at 3 works. See you there.')).toBe(0);
    const heavy =
      'I hope this email finds you well. Great question. Let me know if you have any questions. Feel free to reach out.';
    expect(slopScore(heavy)).toBe(1);
  });

  it('scores a single tell partially (one third)', () => {
    expect(slopScore('Happy to help with that.')).toBeCloseTo(1 / 3, 5);
  });

  it('summarizeSlop renders matched text + category, empty when clean', () => {
    expect(summarizeSlop(detectSlop('Tuesday works.'))).toBe('');
    const s = summarizeSlop(detectSlop('Happy to help.'));
    expect(s).toMatch(/happy to help/i);
    expect(s).toMatch(/filler-enthusiasm/);
  });

  it('hasSlop and detectSlop agree', () => {
    expect(hasSlop('')).toBe(false);
    expect(detectSlop('')).toEqual([]);
  });
});
