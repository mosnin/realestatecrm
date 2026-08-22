import type { Page } from '@playwright/test';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalUrl(raw: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/**
 * Abort every request that isn't for the local dev server.
 *
 * The public pages reference third parties (Clerk JS, Amplitude, Sentry,
 * Calendly, marketing pixels). None of them are what these tests verify, and
 * all of them flake in offline/CI environments — so they are deliberately
 * blocked. The corresponding load failures are excluded from console-error
 * assertions by `collectUnexpectedErrors`.
 */
export async function blockExternalRequests(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    if (isLocalUrl(route.request().url())) return route.continue();
    return route.abort('blockedbyclient');
  });
}

/**
 * Collect console errors + uncaught page errors that indicate a real app
 * problem (hydration mismatch, render crash, unhandled rejection), while
 * ignoring the noise that `blockExternalRequests` deliberately causes:
 *
 *   - resource/fetch failures (net::ERR_*, "Failed to fetch") — the direct
 *     result of aborting third-party requests;
 *   - anything emitted from a non-local script URL;
 *   - Clerk boot noise — clerk-js is served from the (blocked) Clerk CDN and
 *     the publishable key is a stub, so it can never load here.
 *
 * Register BEFORE page.goto(). Assert `expect(errors).toEqual([])` at the end.
 */
export function collectUnexpectedErrors(page: Page): string[] {
  const errors: string[] = [];

  const isExpectedNoise = (text: string, sourceUrl: string): boolean => {
    if (sourceUrl && !isLocalUrl(sourceUrl)) return true;
    if (/net::ERR_|ERR_BLOCKED_BY_CLIENT|Failed to load resource/i.test(text)) return true;
    if (/Failed to fetch|NetworkError|Load failed/i.test(text)) return true;
    if (/clerk/i.test(text)) return true;
    // Amplitude's local snippet still tries to fetch remote config / flush
    // events even though the pixel/CDN requests are blocked. Those retries
    // log console.error ("remote config", "exceeded retry count") — same
    // deliberate-block noise as the other analytics vendors.
    if (/Amplitude Logger/i.test(text)) return true;
    return false;
  };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isExpectedNoise(text, msg.location()?.url ?? '')) return;
    errors.push(`console.error: ${text}`);
  });

  page.on('pageerror', (err) => {
    const text = err.message ?? String(err);
    if (isExpectedNoise(text, '')) return;
    errors.push(`pageerror: ${text}`);
  });

  return errors;
}
