'use client';

/**
 * MarketingPixels — injects the base snippet for every configured analytics /
 * ad platform and fires a unified PageView on each App Router route change.
 *
 * Each platform is gated on its own public env var (see lib/analytics/
 * providers.ts), so this renders only the loaders that are actually turned on.
 * Out of the box only Meta loads (it has a committed fallback id); the rest stay
 * dark until their `NEXT_PUBLIC_*` id is set.
 *
 * SPA note: the base snippets fire one PageView on first load; the App Router
 * navigates without a reload, so RouteChangePageViews re-fires PageView (fanned
 * out to every provider) on each pathname/search change.
 *
 * Mounted once in the root layout so it covers the public marketing site AND the
 * signed-in app. Renders nothing visible. Pixel ids are public by design.
 */

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';
import { META_PIXEL_ID } from '@/lib/analytics/meta-pixel';
import { trackPageView } from '@/lib/analytics/events';
import {
  PIXELS,
  usesGtag,
  gtagSrc,
  gtagInlineSnippet,
  clarityInlineSnippet,
  linkedinInlineSnippet,
  tiktokInlineSnippet,
  pinterestInlineSnippet,
  redditInlineSnippet,
  bingInlineSnippet,
} from '@/lib/analytics/providers';

function RouteChangePageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Skip the first run — the base snippets already counted the initial load.
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    trackPageView();
  }, [pathname, searchParams]);

  return null;
}

export function MarketingPixels() {
  return (
    <>
      {/* ── Meta (Facebook) Pixel ── */}
      {META_PIXEL_ID && (
        <>
          <Script id="meta-pixel-base" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {/* ── Google: GA4 + Google Ads (shared gtag.js loader) ── */}
      {usesGtag && (
        <>
          <Script id="gtag-src" src={gtagSrc()} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {gtagInlineSnippet()}
          </Script>
        </>
      )}

      {/* ── Microsoft Clarity ── */}
      {PIXELS.clarityId && (
        <Script id="ms-clarity" strategy="afterInteractive">
          {clarityInlineSnippet()}
        </Script>
      )}

      {/* ── LinkedIn Insight Tag ── */}
      {PIXELS.linkedinPartnerId && (
        <>
          <Script id="linkedin-insight" strategy="afterInteractive">
            {linkedinInlineSnippet()}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              alt=""
              src={`https://px.ads.linkedin.com/collect/?pid=${PIXELS.linkedinPartnerId}&fmt=gif`}
            />
          </noscript>
        </>
      )}

      {/* ── TikTok Pixel ── */}
      {PIXELS.tiktokId && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {tiktokInlineSnippet()}
        </Script>
      )}

      {/* ── Pinterest Tag ── */}
      {PIXELS.pinterestId && (
        <Script id="pinterest-tag" strategy="afterInteractive">
          {pinterestInlineSnippet()}
        </Script>
      )}

      {/* ── Reddit Pixel ── */}
      {PIXELS.redditId && (
        <Script id="reddit-pixel" strategy="afterInteractive">
          {redditInlineSnippet()}
        </Script>
      )}

      {/* ── Microsoft Bing UET ── */}
      {PIXELS.bingId && (
        <Script id="bing-uet" strategy="afterInteractive">
          {bingInlineSnippet()}
        </Script>
      )}

      {/* SPA PageView fan-out — useSearchParams must sit under Suspense. */}
      <Suspense fallback={null}>
        <RouteChangePageViews />
      </Suspense>
    </>
  );
}
