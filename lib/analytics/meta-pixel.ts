/**
 * Meta (Facebook) Pixel — low-level client helpers.
 *
 * The base pixel is injected once by <MarketingPixels>; these are the raw fbq
 * senders. The cross-platform conversion helpers (trackSignUp / trackPurchase /
 * …) live in lib/analytics/events.ts and fan out to Meta + every other
 * configured provider — import those, not these, from product code.
 *
 * Everything here is browser-only and best-effort: if the pixel isn't
 * configured (no id) or `fbq` hasn't loaded yet, the calls no-op rather than
 * throw. Never block a user flow on analytics.
 *
 * Pixel id resolution: NEXT_PUBLIC_META_PIXEL_ID, falling back to the known
 * Chippi pixel so tracking works even before the env var is set in Vercel.
 */

export const META_PIXEL_ID =
  process.env.NEXT_PUBLIC_META_PIXEL_ID || '1940301233345696';

declare global {
  interface Window {
    // Matches the ambient declaration in lib/tracking-events.ts — keep in sync.
    fbq?: (...args: unknown[]) => void;
  }
}

/** True only in the browser with the pixel loaded. */
function ready(): boolean {
  return typeof window !== 'undefined' && typeof window.fbq === 'function';
}

/** Fire a Meta *standard* event (PageView, CompleteRegistration, Purchase…). */
export function mpTrack(event: string, params?: Record<string, unknown>): void {
  if (!ready()) return;
  try {
    window.fbq!('track', event, params);
  } catch {
    /* best-effort */
  }
}

/** Fire a Meta *custom* event (anything not in the standard catalog). */
export function mpTrackCustom(event: string, params?: Record<string, unknown>): void {
  if (!ready()) return;
  try {
    window.fbq!('trackCustom', event, params);
  } catch {
    /* best-effort */
  }
}

/** A standalone PageView (the base snippet fires the first one; this is for
 *  client-side route changes in the App Router, which don't reload the page). */
export function mpPageView(): void {
  mpTrack('PageView');
}
