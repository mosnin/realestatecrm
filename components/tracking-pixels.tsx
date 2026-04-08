import type { TrackingPixels as TrackingPixelsType } from '@/lib/types';

/**
 * Server component that renders tracking pixel scripts for public-facing pages.
 * Each pixel loads asynchronously / non-blocking via `async` or deferred init patterns.
 */
export function TrackingPixels({ pixels }: { pixels: TrackingPixelsType | null }) {
  if (!pixels) return null;

  const hasAny =
    pixels.facebookPixelId ||
    pixels.tiktokPixelId ||
    pixels.googleAnalyticsId ||
    pixels.googleAdsId ||
    pixels.twitterPixelId ||
    pixels.linkedinPartnerId ||
    pixels.snapchatPixelId ||
    pixels.customHeadScript;

  if (!hasAny) return null;

  return (
    <>
      {/* Meta/Facebook Pixel */}
      {pixels.facebookPixelId && (
        <>
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixels.facebookPixelId}');fbq('track','PageView');`,
            }}
          />
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: 'none' }}
              src={`https://www.facebook.com/tr?id=${pixels.facebookPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {/* TikTok Pixel */}
      {pixels.tiktokPixelId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${pixels.tiktokPixelId}');ttq.page()}(window,document,'ttq');`,
          }}
        />
      )}

      {/* Google Analytics (GA4) */}
      {pixels.googleAnalyticsId && (
        <>
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${pixels.googleAnalyticsId}`}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${pixels.googleAnalyticsId}');`,
            }}
          />
        </>
      )}

      {/* Google Ads — only render gtag loader if GA4 didn't already load it */}
      {pixels.googleAdsId && !pixels.googleAnalyticsId && (
        <>
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${pixels.googleAdsId}`}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${pixels.googleAdsId}');`,
            }}
          />
        </>
      )}
      {/* Google Ads config when GA4 already loaded gtag */}
      {pixels.googleAdsId && pixels.googleAnalyticsId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `gtag('config','${pixels.googleAdsId}');`,
          }}
        />
      )}

      {/* Twitter/X Pixel */}
      {pixels.twitterPixelId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments)},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');twq('config','${pixels.twitterPixelId}');`,
          }}
        />
      )}

      {/* LinkedIn Insight Tag */}
      {pixels.linkedinPartnerId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `_linkedin_partner_id="${pixels.linkedinPartnerId}";(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s)})(window.lintrk);`,
          }}
        />
      )}

      {/* Snapchat Pixel */}
      {pixels.snapchatPixelId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init','${pixels.snapchatPixelId}',{});snaptr('track','PAGE_VIEW');`,
          }}
        />
      )}

      {/* Custom Head Script */}
      {pixels.customHeadScript && (
        <script
          dangerouslySetInnerHTML={{
            __html: pixels.customHeadScript,
          }}
        />
      )}
    </>
  );
}
