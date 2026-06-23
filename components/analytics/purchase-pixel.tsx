'use client';

/**
 * PurchasePixel — fires a Meta Pixel `Purchase` once when the buyer lands back
 * on a billing page after a completed Stripe Checkout.
 *
 * Stripe redirects to `…/billing?session_id=cs_…` (subscriptions) or
 * `…/billing?topup=success` (credit top-ups). This component detects either,
 * fetches the charged amount from /api/billing/checkout-value (subscriptions
 * only — top-ups don't carry a session id here), and fires Purchase with the
 * value + currency.
 *
 * De-duped via sessionStorage keyed on the session id (or a per-tab marker for
 * top-ups) so a refresh of the success URL doesn't double-count the conversion.
 *
 * Mount on the realtor and broker billing pages. Renders nothing.
 */

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackPurchase } from '@/lib/analytics/meta-pixel';

export function PurchasePixel() {
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;

    const sessionId = params.get('session_id');
    const topup = params.get('topup');
    if (!sessionId && topup !== 'success') return;

    const dedupeKey = `chippi:purchase:${sessionId ?? 'topup'}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) return;
      sessionStorage.setItem(dedupeKey, '1');
    } catch {
      /* sessionStorage unavailable — fall through and fire once per mount */
    }
    fired.current = true;

    if (!sessionId) {
      // Credit top-up: no session id in the return URL, fire a countable
      // Purchase without an exact value.
      trackPurchase({ contentName: 'credit_topup' });
      return;
    }

    // Subscription: look up the charged amount so the event carries value.
    fetch(`/api/billing/checkout-value?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { value?: number | null; currency?: string | null; plan?: string | null } | null) => {
        trackPurchase({
          value: typeof data?.value === 'number' ? data.value : undefined,
          currency: data?.currency ?? 'USD',
          contentName: data?.plan ?? undefined,
        });
      })
      .catch(() => {
        // Network/lookup failed — still fire a countable Purchase.
        trackPurchase({});
      });
  }, [params]);

  return null;
}
