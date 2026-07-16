import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { searchWeb, tavilyConfigured } from '@/lib/research/tavily';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROXY_PATH = '/api/browser/proxy';

/**
 * GET /api/browser/search?q=<query>
 *
 * Real web search for the side panel's Browser tab. A lightweight HTML proxy
 * can't scrape Google/DuckDuckGo server-side (they bot-wall datacenter IPs),
 * so "search" in the URL bar routes here: we query Tavily (a search API built
 * for programmatic use) and render a clean, styled results page from our own
 * origin. Each result links THROUGH the proxy so clicking one stays in-panel.
 *
 * Returns styled HTML (the iframe renders whatever comes back), never JSON.
 * Auth-gated + rate-limited. Degrades honestly when Tavily isn't configured.
 */
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return page(401, 'Sign in to search.', 'This viewer is part of your workspace.');

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (!q) return page(400, 'Type something to search.', 'Enter a few words in the address bar.');

  if (!tavilyConfigured()) {
    return page(
      503,
      'Search isn’t set up here.',
      'Web search needs a TAVILY_API_KEY. You can still open any address directly.',
      `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      'Search on Google',
    );
  }

  const { allowed } = await checkRateLimit(`browser:search:${userId}`, 40, 300);
  if (!allowed) return page(429, 'Slow down a moment.', 'Too many searches — try again shortly.');

  let results: Awaited<ReturnType<typeof searchWeb>> = [];
  try {
    results = await searchWeb(q, AbortSignal.timeout(10_000));
  } catch (err) {
    logger.warn('[browser/search] failed', { q }, err);
    return page(
      502,
      'Search hit a snag.',
      'Try again in a moment, or open an address directly.',
      `https://www.google.com/search?q=${encodeURIComponent(q)}`,
      'Search on Google',
    );
  }

  return new NextResponse(resultsPage(q, results), { status: 200, headers: htmlHeaders() });
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function resultsPage(query: string, results: Array<{ url: string; title: string; snippet: string }>): string {
  const rows =
    results.length === 0
      ? `<p class="empty">No results for “${esc(query)}”. Try different words, or open an address directly.</p>`
      : results
          .map((r) => {
            const proxied = `${PROXY_PATH}?url=${encodeURIComponent(r.url)}`;
            return `<article>
  <a class="title" href="${esc(proxied)}">${esc(r.title || r.url)}</a>
  <div class="host">${esc(hostOf(r.url))}</div>
  ${r.snippet ? `<p class="snippet">${esc(r.snippet.slice(0, 240))}</p>` : ''}
</article>`;
          })
          .join('\n');

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:dark light}
  *{box-sizing:border-box}
  body{margin:0;padding:1.25rem 1.25rem 3rem;background:transparent;color:#c7c7cc;
    font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  header{font-size:12px;color:#8a8a8e;margin:0 0 1rem;padding-bottom:.75rem;border-bottom:1px solid rgba(140,140,148,.18)}
  header b{color:#c7c7cc;font-weight:600}
  article{padding:.85rem 0;border-bottom:1px solid rgba(140,140,148,.12)}
  a.title{color:#4a9eff;text-decoration:none;font-size:15px;font-weight:600;line-height:1.35;display:inline-block}
  a.title:hover{text-decoration:underline}
  .host{color:#8a8a8e;font-size:12px;margin:.15rem 0 .35rem}
  .snippet{margin:0;color:#a1a1a6}
  .empty{color:#8a8a8e;margin-top:2rem;text-align:center}
  @media (prefers-color-scheme: light){
    body{color:#1d1d1f} header b{color:#1d1d1f} a.title{color:#0066cc}
    .host,.snippet,.empty,header{color:#6e6e73}
  }
</style>
<header>Results for <b>${esc(query)}</b> · powered by Tavily</header>
${rows}`;
}

function htmlHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "script-src 'none'; frame-ancestors 'self'",
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  };
}

function page(status: number, title: string, detail: string, url?: string, linkLabel = 'Open in a new tab'): NextResponse {
  const link = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(linkLabel)}</a>` : '';
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;display:grid;place-items:center;min-height:100vh;background:transparent;color:#8a8a8e;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center}
  main{padding:2rem;max-width:26rem}
  h1{font-size:15px;font-weight:600;color:#c7c7cc;margin:0 0 .35rem}
  p{margin:0 0 1.1rem}
  a{color:#F25A00;text-decoration:none;font-weight:500}
</style>
<main><h1>${esc(title)}</h1><p>${esc(detail)}</p>${link}</main>`;
  return new NextResponse(html, { status, headers: htmlHeaders() });
}
