/**
 * buildEvidence assembles the compact evidence block handed to the LLM
 * structuring step. It is pure and deterministic, and two of its guarantees
 * matter: it caps searchSnippets at 8 (token-budget defense) and projects each
 * search result down to exactly {url,title,snippet} — never leaking extra
 * fields (e.g. score, rawContent) into the prompt. Pin the cap, the projection,
 * and the verbatim passthrough of subject + scraped pages.
 */

import { describe, it, expect } from 'vitest';
import { buildEvidence } from '@/lib/property-analysis';

type Subject = Parameters<typeof buildEvidence>[0];
type Results = Parameters<typeof buildEvidence>[1];
type Pages = Parameters<typeof buildEvidence>[2];

const subject = { address: '123 Main St', city: 'Austin', stateRegion: 'TX' } as unknown as Subject;

const result = (i: number) =>
  ({
    url: `https://x.com/${i}`,
    title: `Listing ${i}`,
    snippet: `snippet ${i}`,
    score: 0.9, // extra field that must NOT leak into the evidence
    rawContent: 'lots of noise',
  });

const results = (n: number): Results => Array.from({ length: n }, (_, i) => result(i)) as unknown as Results;

describe('buildEvidence', () => {
  it('projects each result down to exactly {url,title,snippet}', () => {
    const ev = buildEvidence(subject, results(2), [] as unknown as Pages);
    expect(ev.searchSnippets).toEqual([
      { url: 'https://x.com/0', title: 'Listing 0', snippet: 'snippet 0' },
      { url: 'https://x.com/1', title: 'Listing 1', snippet: 'snippet 1' },
    ]);
    // the extra score/rawContent fields are dropped
    expect(ev.searchSnippets[0]).not.toHaveProperty('score');
    expect(ev.searchSnippets[0]).not.toHaveProperty('rawContent');
  });

  it('caps searchSnippets at 8 even with more results', () => {
    const ev = buildEvidence(subject, results(20), [] as unknown as Pages);
    expect(ev.searchSnippets).toHaveLength(8);
    expect(ev.searchSnippets[7].url).toBe('https://x.com/7'); // keeps the top-ranked 8, in order
  });

  it('keeps every snippet when there are 8 or fewer', () => {
    expect(buildEvidence(subject, results(8), [] as unknown as Pages).searchSnippets).toHaveLength(8);
    expect(buildEvidence(subject, results(3), [] as unknown as Pages).searchSnippets).toHaveLength(3);
  });

  it('passes subject and scraped pages through verbatim', () => {
    const pages = [{ url: 'https://x.com/p', markdown: 'facts' }] as unknown as Pages;
    const ev = buildEvidence(subject, [] as unknown as Results, pages);
    expect(ev.subject).toBe(subject);
    expect(ev.pages).toBe(pages);
    expect(ev.searchSnippets).toEqual([]);
  });
});
