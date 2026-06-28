/**
 * Unit tests for extractScoreJson — the lenient parser that keeps a single
 * cosmetically-imperfect model response from collapsing a re-score into a dead
 * 'failed'. It must recover JSON from code fences / surrounding prose (the
 * json_object retry path) and clamp the score, while still rejecting genuinely
 * unparseable or non-numeric output.
 */

import { describe, it, expect } from 'vitest';
import { extractScoreJson } from '@/lib/dynamic-lead-scoring';

const VALID = JSON.stringify({
  leadScore: 82,
  scoreLabel: 'hot',
  scoreSummary: 'Strong, ready buyer.',
  scoreDetails: { tags: ['pre-approved'], strengths: [], weaknesses: [], riskFlags: [] },
});

describe('extractScoreJson', () => {
  it('parses a clean JSON object', () => {
    const r = extractScoreJson(VALID);
    expect(r?.leadScore).toBe(82);
    expect(r?.scoreLabel).toBe('hot');
  });

  it('recovers JSON wrapped in a ```json code fence', () => {
    const r = extractScoreJson('```json\n' + VALID + '\n```');
    expect(r?.leadScore).toBe(82);
  });

  it('recovers JSON surrounded by prose', () => {
    const r = extractScoreJson(`Here is the score:\n${VALID}\nHope that helps!`);
    expect(r?.leadScore).toBe(82);
  });

  it('clamps and rounds the score to 0–100', () => {
    expect(extractScoreJson(JSON.stringify({ leadScore: 140 }))?.leadScore).toBe(100);
    expect(extractScoreJson(JSON.stringify({ leadScore: -10 }))?.leadScore).toBe(0);
    expect(extractScoreJson(JSON.stringify({ leadScore: 73.6 }))?.leadScore).toBe(74);
  });

  it('returns null for a non-numeric or missing leadScore', () => {
    expect(extractScoreJson(JSON.stringify({ leadScore: 'high' }))).toBeNull();
    expect(extractScoreJson(JSON.stringify({ scoreLabel: 'hot' }))).toBeNull();
  });

  it('returns null when there is no JSON object at all', () => {
    expect(extractScoreJson('the model said nothing useful')).toBeNull();
    expect(extractScoreJson('')).toBeNull();
  });

  it('returns null for truncated/invalid JSON (the original 400-token failure)', () => {
    // A response cut off mid-array — the exact shape max_tokens:400 produced.
    const truncated = '{"leadScore": 80, "scoreSummary": "Good", "scoreDetails": {"tags": ["a", "b';
    expect(extractScoreJson(truncated)).toBeNull();
  });
});
