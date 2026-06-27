/**
 * Two pure-ish area-analysis seams:
 *  - buildAreaEvidence assembles the LLM evidence block — caps searchSnippets at
 *    8 and projects each result to exactly {url,title,snippet} (no field leak).
 *  - missingResearchKeys reports which research providers are unconfigured; the
 *    /areas route uses it to short-circuit to 'not_configured' before any spend.
 * Pin the cap + projection, and that the key check reflects each provider's
 * configured state independently (order: Tavily, then Firecrawl).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tavilyConfigured, firecrawlConfigured } = vi.hoisted(() => ({
  tavilyConfigured: vi.fn(() => true),
  firecrawlConfigured: vi.fn(() => true),
}));

vi.mock('@/lib/research/tavily', () => ({
  tavilyConfigured,
  searchArea: vi.fn(),
}));
vi.mock('@/lib/research/firecrawl', () => ({
  firecrawlConfigured,
  scrapeArea: vi.fn(),
  MAX_SCRAPES: 3,
}));

import { buildAreaEvidence, missingResearchKeys } from '@/lib/area-analysis';

type Subject = Parameters<typeof buildAreaEvidence>[0];
type Results = Parameters<typeof buildAreaEvidence>[1];
type Pages = Parameters<typeof buildAreaEvidence>[2];

const subject = { area: 'Eastside', city: 'Austin', stateRegion: 'TX' } as unknown as Subject;
const results = (n: number): Results =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://x.com/${i}`,
    title: `T${i}`,
    snippet: `s${i}`,
    score: 0.5, // must NOT leak
  })) as unknown as Results;

describe('buildAreaEvidence', () => {
  it('caps snippets at 8 and projects to exactly {url,title,snippet}', () => {
    const ev = buildAreaEvidence(subject, results(20), [] as unknown as Pages);
    expect(ev.searchSnippets).toHaveLength(8);
    expect(ev.searchSnippets[0]).toEqual({ url: 'https://x.com/0', title: 'T0', snippet: 's0' });
    expect(ev.searchSnippets[0]).not.toHaveProperty('score');
  });

  it('passes subject + pages through verbatim', () => {
    const pages = [{ url: 'https://x.com/p' }] as unknown as Pages;
    const ev = buildAreaEvidence(subject, [] as unknown as Results, pages);
    expect(ev.subject).toBe(subject);
    expect(ev.pages).toBe(pages);
    expect(ev.searchSnippets).toEqual([]);
  });
});

describe('missingResearchKeys', () => {
  beforeEach(() => {
    tavilyConfigured.mockReturnValue(true);
    firecrawlConfigured.mockReturnValue(true);
  });

  it('is empty when both providers are configured', () => {
    expect(missingResearchKeys()).toEqual([]);
  });

  it('reports each unconfigured provider independently, Tavily first', () => {
    tavilyConfigured.mockReturnValue(false);
    expect(missingResearchKeys()).toEqual(['TAVILY_API_KEY']);

    tavilyConfigured.mockReturnValue(true);
    firecrawlConfigured.mockReturnValue(false);
    expect(missingResearchKeys()).toEqual(['FIRECRAWL_API_KEY']);

    tavilyConfigured.mockReturnValue(false);
    expect(missingResearchKeys()).toEqual(['TAVILY_API_KEY', 'FIRECRAWL_API_KEY']);
  });
});
