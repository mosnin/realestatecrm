/**
 * Small, UI-safe data contracts for the Research Workspace. The workspace is
 * an oversight surface, not another agent runtime: it only renders bounded
 * action outcomes and public page links already returned by browser control.
 */

export interface ResearchSourceLink {
  id: string;
  href: string;
  label: string;
  timestamp: string;
}

export interface ResearchActionEntry {
  id: string;
  type: string;
  summary: string;
  timestamp: string;
  ok: boolean;
  status: 'queued' | 'running' | 'done' | 'error' | 'expired';
}

function oneLine(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Keep source links deliberately boring and bounded. Browser controls may
 * report a page title/URL, but this UI never renders DOM snapshots, typed
 * values, screenshots, or arbitrary result payloads as a source.
 */
export function toResearchSourceLink(input: {
  id: string;
  pageUrl?: unknown;
  pageTitle?: unknown;
  timestamp: string;
}): ResearchSourceLink | null {
  if (typeof input.pageUrl !== 'string') return null;

  try {
    const url = new URL(input.pageUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const title = typeof input.pageTitle === 'string' ? oneLine(input.pageTitle, 120) : '';
    return {
      id: input.id,
      href: url.toString(),
      label: title || oneLine(url.hostname, 120),
      timestamp: input.timestamp,
    };
  } catch {
    return null;
  }
}

/** Newest source for a URL wins; retain a compact, readable timeline. */
export function boundedResearchSources(
  sources: readonly ResearchSourceLink[],
  limit = 8,
): ResearchSourceLink[] {
  const seen = new Set<string>();
  const newestFirst: ResearchSourceLink[] = [];
  for (const source of [...sources].reverse()) {
    if (seen.has(source.href)) continue;
    seen.add(source.href);
    newestFirst.push(source);
    if (newestFirst.length === limit) break;
  }
  return newestFirst.reverse();
}

/**
 * Translate only the two browser tools' bounded result contracts into UI
 * activity. Unknown tool payloads are ignored; this is intentionally not a
 * generic "render tool output" escape hatch.
 */
export function researchActivityFromToolResult(input: {
  name: string;
  data: unknown;
  ok: boolean;
  idPrefix: string;
  timestamp: string;
}): { actions: ResearchActionEntry[]; sources: ResearchSourceLink[]; shouldOpen: boolean } | null {
  if (!input.data || typeof input.data !== 'object') return null;
  const result = input.data as Record<string, unknown>;

  if (input.name === 'control_browser') {
    const actionType = typeof result.actionType === 'string' ? result.actionType : null;
    if (!actionType) return null;
    const completed = input.ok && result.ok === true;
    return {
      actions: [{
        id: `${input.idPrefix}:0`,
        type: actionType,
        summary: completed ? `Completed ${actionType.replace(/_/g, ' ')}` : `${actionType.replace(/_/g, ' ')} did not complete`,
        timestamp: input.timestamp,
        ok: completed,
        status: completed ? 'done' : 'error',
      }],
      sources: [toResearchSourceLink({
        id: `${input.idPrefix}:source`,
        pageUrl: result.pageUrl,
        pageTitle: result.pageTitle,
        timestamp: input.timestamp,
      })].flatMap((source) => source ? [source] : []),
      shouldOpen: completed && result.source === 'headless',
    };
  }

  if (input.name !== 'browser_task' || !Array.isArray(result.steps)) return null;
  const completed = input.ok && result.status === 'done';
  const actions: ResearchActionEntry[] = result.steps.slice(0, 10).flatMap((step, index): ResearchActionEntry[] => {
    if (!step || typeof step !== 'object') return [];
    const row = step as Record<string, unknown>;
    if (typeof row.action !== 'string') return [];
    const detail = typeof row.summary === 'string'
      ? oneLine(row.summary, 180)
      : typeof row.detail === 'string'
        ? oneLine(row.detail, 180)
        : row.action.replace(/_/g, ' ');
    return [{
      id: `${input.idPrefix}:${index}`,
      type: row.action,
      summary: detail || row.action.replace(/_/g, ' '),
      timestamp: input.timestamp,
      ok: row.ok === true,
      status: row.ok === true ? 'done' : 'error',
    }];
  });
  return {
    actions,
    sources: (Array.isArray(result.sources) ? result.sources : [{ url: result.pageUrl, title: result.pageTitle }])
      .slice(0, 12)
      .flatMap((raw, index) => {
        if (!raw || typeof raw !== 'object') return [];
        const source = raw as Record<string, unknown>;
        const link = toResearchSourceLink({
          id: `${input.idPrefix}:source:${index}`,
          pageUrl: source.url,
          pageTitle: source.title,
          timestamp: input.timestamp,
        });
        return link ? [link] : [];
      }),
    shouldOpen: completed && result.source === 'headless',
  };
}
