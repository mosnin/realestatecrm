'use client';

/**
 * MetaPixel — injects the Meta (Facebook) Pixel base snippet once and fires a
 * PageView on every client-side route change.
 *
 * Why the route-change listener: the App Router navigates without a full page
 * reload, so the base snippet's single PageView only covers the first load.
 * Without this, SPA navigations (most of a session) would go untracked. We
 * watch the pathname + search params and re-fire PageView on each change.
 *
 * Mounted once in the root layout so it covers BOTH the public marketing site
 * and the signed-in app — that's how "website traffic" gets tracked everywhere.
 *
 * Renders nothing. No-ops entirely when no pixel id is configured. The pixel id
 * is public (it ships in client JS by design), so hardcoding the fallback is
 * fine — it is not a secret.
 */

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';
import { META_PIXEL_ID, mpPageView } from '@/lib/analytics/meta-pixel';

function RouteChangePageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Skip the very first effect run — the base snippet already fired PageView
  // for the initial load, and double-counting it would inflate traffic.
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    mpPageView();
  }, [pathname, searchParams]);

  return null;
}

export function MetaPixel() {
  if (!META_PIXEL_ID) return null;

  return (
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
      {/* useSearchParams must live under Suspense to avoid opting the whole
          tree into client-side bailout during prerender. */}
      <Suspense fallback={null}>
        <RouteChangePageViews />
      </Suspense>
    </>
  );
}
