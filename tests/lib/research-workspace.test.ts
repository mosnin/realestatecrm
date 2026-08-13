import { describe, expect, it } from 'vitest';
import {
  boundedResearchSources,
  researchActivityFromToolResult,
  toResearchSourceLink,
} from '@/lib/chippi/research-workspace';

describe('Research Workspace result shaping', () => {
  it('keeps only http(s) source links and never turns a title into a URL', () => {
    expect(toResearchSourceLink({ id: 'x', pageUrl: 'javascript:alert(1)', timestamp: '2026-07-29T00:00:00.000Z' })).toBeNull();
    expect(toResearchSourceLink({ id: 'x', pageUrl: 'https://example.com/a', pageTitle: '  Example\nResearch  ', timestamp: '2026-07-29T00:00:00.000Z' }))
      .toMatchObject({ href: 'https://example.com/a', label: 'Example Research' });
  });

  it('preserves bounded browser_task sources and opens only a completed task', () => {
    const activity = researchActivityFromToolResult({
      name: 'browser_task',
      ok: true,
      idPrefix: 'task-1',
      timestamp: '2026-07-29T00:00:00.000Z',
      data: {
        status: 'done',
        source: 'headless',
        steps: [{ action: 'read_dom', detail: 'Read listing results', ok: true }],
        sources: [
          { url: 'https://example.com/one', title: 'One' },
          { url: 'https://example.com/two', title: 'Two' },
          { url: 'file:///private-note', title: 'Never shown' },
        ],
      },
    });
    expect(activity?.shouldOpen).toBe(true);
    expect(activity?.actions).toHaveLength(1);
    expect(activity?.sources.map((source) => source.label)).toEqual(['One', 'Two']);
  });

  it('does not auto-open a browser task that timed out or only returned a transport success', () => {
    const activity = researchActivityFromToolResult({
      name: 'browser_task',
      ok: true,
      idPrefix: 'task-2',
      timestamp: '2026-07-29T00:00:00.000Z',
      data: { status: 'timeout', steps: [] },
    });
    expect(activity?.shouldOpen).toBe(false);
  });

  it('keeps a completed paired-browser control result in the existing Browser experience', () => {
    const activity = researchActivityFromToolResult({
      name: 'control_browser',
      ok: true,
      idPrefix: 'control-1',
      timestamp: '2026-07-29T00:00:00.000Z',
      data: { ok: true, actionType: 'navigate', source: 'extension' },
    });
    expect(activity?.shouldOpen).toBe(false);
  });

  it('deduplicates sources by URL and keeps the newest bounded evidence', () => {
    const sources = boundedResearchSources([
      { id: '1', href: 'https://example.com/a', label: 'Old', timestamp: '2026-07-29T00:00:00.000Z' },
      { id: '2', href: 'https://example.com/b', label: 'B', timestamp: '2026-07-29T00:01:00.000Z' },
      { id: '3', href: 'https://example.com/a', label: 'New', timestamp: '2026-07-29T00:02:00.000Z' },
    ], 2);
    expect(sources).toEqual([
      { id: '2', href: 'https://example.com/b', label: 'B', timestamp: '2026-07-29T00:01:00.000Z' },
      { id: '3', href: 'https://example.com/a', label: 'New', timestamp: '2026-07-29T00:02:00.000Z' },
    ]);
  });
});
