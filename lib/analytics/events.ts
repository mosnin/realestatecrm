/**
 * Unified marketing analytics events.
 *
 * One call site per business moment (page view, signup, onboarding, purchase)
 * that fans out to EVERY configured ad/analytics platform — Meta plus the
 * gtag/Clarity/LinkedIn/TikTok/Pinterest/Reddit/Bing family in providers.ts.
 *
 * Components and flows import from here, not from the per-provider modules, so
 * adding or removing a channel never touches the product code — only this file
 * and providers.ts change.
 *
 * Every send is best-effort and no-ops when a platform isn't configured/loaded.
 */

import { mpTrack, mpTrackCustom, mpPageView } from '@/lib/analytics/meta-pixel';
import {
  PIXELS,
  ga4Event,
  ga4PageView,
  googleAdsConversion,
  linkedinConversion,
  tiktokTrack,
  tiktokPage,
  pinterestTrack,
  pinterestPage,
  redditTrack,
  bingEvent,
  bingPageView,
} from '@/lib/analytics/providers';

/** Client-side route-change page view, sent to every live provider. */
export function trackPageView(): void {
  mpPageView();
  ga4PageView();
  tiktokPage();
  pinterestPage();
  redditTrack('PageVisit');
  bingPageView();
  // Clarity + LinkedIn auto-track page context; nothing to fire per route.
}

/** Signup — a Clerk account was created and onboarding finished activating it. */
export function trackSignUp(): void {
  mpTrack('CompleteRegistration', { status: true });
  ga4Event('sign_up');
  googleAdsConversion(PIXELS.googleAdsSignupLabel);
  linkedinConversion(PIXELS.linkedinSignupConversionId);
  tiktokTrack('CompleteRegistration');
  pinterestTrack('signup');
  redditTrack('SignUp');
  bingEvent('signup');
}

/** Onboarding finished — workspace setup complete (distinct from raw signup). */
export function trackOnboardingComplete(params?: { accountType?: string }): void {
  mpTrackCustom('CompleteOnboarding', params);
  ga4Event('onboarding_complete', params?.accountType ? { account_type: params.accountType } : undefined);
  bingEvent('onboarding_complete', params);
}

/** Purchase — a Stripe subscription/top-up checkout completed. */
export function trackPurchase(params: {
  value?: number;
  currency?: string;
  contentName?: string;
}): void {
  const { value, currency = 'USD', contentName } = params;
  const hasValue = typeof value === 'number';

  mpTrack('Purchase', {
    currency,
    ...(hasValue ? { value } : {}),
    ...(contentName ? { content_name: contentName } : {}),
  });
  ga4Event('purchase', {
    currency,
    ...(hasValue ? { value } : {}),
    ...(contentName ? { items: [{ item_name: contentName }] } : {}),
  });
  googleAdsConversion(PIXELS.googleAdsPurchaseLabel, { value, currency });
  linkedinConversion(PIXELS.linkedinPurchaseConversionId);
  tiktokTrack('CompletePayment', { currency, ...(hasValue ? { value } : {}) });
  pinterestTrack('checkout', { currency, ...(hasValue ? { value } : {}) });
  redditTrack('Purchase', { currency, ...(hasValue ? { value } : {}) });
  bingEvent('purchase', { currency, ...(hasValue ? { revenue_value: value } : {}) });
}
