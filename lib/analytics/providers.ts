/**
 * Marketing / advertising pixel providers (client-side).
 *
 * One registry for every analytics + ad platform we fire from the browser.
 * Each provider is GATED ON ITS OWN PUBLIC ENV VAR — nothing loads or fires
 * until an id is set, so this whole layer is a no-op out of the box and each
 * channel is turned on independently by adding a Vercel env var.
 *
 * Two halves:
 *   - CONFIG + base-snippet builders   → consumed by <MarketingPixels> to inject
 *     each platform's loader script once.
 *   - low-level senders                → consumed by lib/analytics/events.ts to
 *     fan a logical event (signup, purchase…) out to every live provider.
 *
 * Everything is best-effort: senders no-op when the platform's global isn't on
 * the window yet (blocked, still loading, SSR). Analytics must never throw into
 * a user flow.
 *
 * Pixel ids are PUBLIC by design (they ship in client JS); none of these are
 * secrets. Meta lives in lib/analytics/meta-pixel.ts and is fanned in alongside
 * these by events.ts.
 */

/* ── Window globals the platform snippets install ──────────────────────────── */
declare global {
  interface Window {
    dataLayer?: unknown[];
    clarity?: (...args: unknown[]) => void;
    pintrk?: (...args: unknown[]) => void;
    rdt?: (...args: unknown[]) => void;
    uetq?: unknown[];
    // Shared with lib/tracking-events.ts — keep these three identical there.
    gtag?: (...args: unknown[]) => void;
    ttq?: { track: (...args: unknown[]) => void; page?: () => void };
    lintrk?: (action: string, data: Record<string, unknown>) => void;
  }
}

const env = (k: string): string => (process.env[k] ?? '').trim();

/** Resolved, public configuration for every channel. Empty string = off. */
export const PIXELS = {
  ga4Id: env('NEXT_PUBLIC_GA4_ID'), // "G-XXXXXXX"
  googleAdsId: env('NEXT_PUBLIC_GOOGLE_ADS_ID'), // "AW-XXXXXXXXX"
  googleAdsSignupLabel: env('NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL'),
  googleAdsPurchaseLabel: env('NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL'),
  clarityId: env('NEXT_PUBLIC_CLARITY_ID'),
  linkedinPartnerId: env('NEXT_PUBLIC_LINKEDIN_PARTNER_ID'),
  linkedinSignupConversionId: env('NEXT_PUBLIC_LINKEDIN_SIGNUP_CONVERSION_ID'),
  linkedinPurchaseConversionId: env('NEXT_PUBLIC_LINKEDIN_PURCHASE_CONVERSION_ID'),
  tiktokId: env('NEXT_PUBLIC_TIKTOK_PIXEL_ID'),
  pinterestId: env('NEXT_PUBLIC_PINTEREST_TAG_ID'),
  redditId: env('NEXT_PUBLIC_REDDIT_PIXEL_ID'),
  bingId: env('NEXT_PUBLIC_BING_UET_ID'),
} as const;

/** True if gtag.js is needed (GA4 and/or Google Ads share the one loader). */
export const usesGtag = Boolean(PIXELS.ga4Id || PIXELS.googleAdsId);

/** Any non-Meta provider configured? (Meta is handled separately.) */
export const anyProviderConfigured = Boolean(
  usesGtag ||
    PIXELS.clarityId ||
    PIXELS.linkedinPartnerId ||
    PIXELS.tiktokId ||
    PIXELS.pinterestId ||
    PIXELS.redditId ||
    PIXELS.bingId,
);

/* ── Base-snippet builders (loader-injected, once each) ─────────────────────── */
/* These are the platforms' official inline bootstrap scripts, parameterized by
 * id. The async vendor <script src> tag is appended by next/script separately
 * where the snippet doesn't self-append it. */

export function gtagInlineSnippet(): string {
  // One gtag bootstrap; config() each configured id. GA4 sends its own initial
  // page_view; Google Ads is config-only. SPA page_views are sent by events.ts.
  const configs: string[] = [];
  if (PIXELS.ga4Id) configs.push(`gtag('config','${PIXELS.ga4Id}');`);
  if (PIXELS.googleAdsId) configs.push(`gtag('config','${PIXELS.googleAdsId}');`);
  return `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    ${configs.join('\n')}
  `;
}

/** The src for the shared gtag loader (keyed to whichever id exists). */
export function gtagSrc(): string {
  const id = PIXELS.ga4Id || PIXELS.googleAdsId;
  return `https://www.googletagmanager.com/gtag/js?id=${id}`;
}

export function clarityInlineSnippet(): string {
  return `
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${PIXELS.clarityId}");
  `;
}

export function linkedinInlineSnippet(): string {
  return `
    _linkedin_partner_id = "${PIXELS.linkedinPartnerId}";
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(_linkedin_partner_id);
    (function(l){
      if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
      var s=document.getElementsByTagName("script")[0];
      var b=document.createElement("script");
      b.type="text/javascript";b.async=true;
      b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";
      s.parentNode.insertBefore(b,s);
    })(window.lintrk);
  `;
}

export function tiktokInlineSnippet(): string {
  return `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
      ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
      ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
      var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
      var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
      ttq.load('${PIXELS.tiktokId}');ttq.page();
    }(window, document, 'ttq');
  `;
}

export function pinterestInlineSnippet(): string {
  return `
    !function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};
    var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;
    var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
    pintrk('load', '${PIXELS.pinterestId}');
    pintrk('page');
  `;
}

export function redditInlineSnippet(): string {
  return `
    !function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};
    p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;
    var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
    rdt('init','${PIXELS.redditId}');
    rdt('track','PageVisit');
  `;
}

export function bingInlineSnippet(): string {
  return `
    (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${PIXELS.bingId}", enableAutoSpaTracking: true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},
    n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},
    i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");
  `;
}

/* ── Low-level senders (one per platform; safe no-ops when not loaded) ──────── */

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* best-effort */
  }
}

/** GA4 standard/custom event. */
export function ga4Event(name: string, params?: Record<string, unknown>): void {
  if (!PIXELS.ga4Id || typeof window === 'undefined' || !window.gtag) return;
  safe(() => window.gtag!('event', name, { send_to: PIXELS.ga4Id, ...params }));
}

/** GA4 SPA page_view. */
export function ga4PageView(): void {
  ga4Event('page_view');
}

/** Google Ads conversion by label (the part after the slash in send_to). */
export function googleAdsConversion(
  label: string,
  params?: { value?: number; currency?: string; transactionId?: string },
): void {
  if (!PIXELS.googleAdsId || !label || typeof window === 'undefined' || !window.gtag) return;
  safe(() =>
    window.gtag!('event', 'conversion', {
      send_to: `${PIXELS.googleAdsId}/${label}`,
      ...(typeof params?.value === 'number' ? { value: params.value } : {}),
      ...(params?.currency ? { currency: params.currency } : {}),
      ...(params?.transactionId ? { transaction_id: params.transactionId } : {}),
    }),
  );
}

/** LinkedIn conversion by numeric conversion id. */
export function linkedinConversion(conversionId: string): void {
  if (!PIXELS.linkedinPartnerId || !conversionId || typeof window === 'undefined' || !window.lintrk) {
    return;
  }
  safe(() => window.lintrk!('track', { conversion_id: Number(conversionId) }));
}

/** TikTok standard event. */
export function tiktokTrack(name: string, params?: Record<string, unknown>): void {
  if (!PIXELS.tiktokId || typeof window === 'undefined' || !window.ttq?.track) return;
  safe(() => window.ttq!.track(name, params ?? {}));
}

export function tiktokPage(): void {
  if (!PIXELS.tiktokId || typeof window === 'undefined' || !window.ttq?.page) return;
  safe(() => window.ttq!.page!());
}

/** Pinterest event. */
export function pinterestTrack(name: string, params?: Record<string, unknown>): void {
  if (!PIXELS.pinterestId || typeof window === 'undefined' || !window.pintrk) return;
  safe(() => window.pintrk!('track', name, params));
}

export function pinterestPage(): void {
  if (!PIXELS.pinterestId || typeof window === 'undefined' || !window.pintrk) return;
  safe(() => window.pintrk!('page'));
}

/** Reddit event. */
export function redditTrack(name: string, params?: Record<string, unknown>): void {
  if (!PIXELS.redditId || typeof window === 'undefined' || !window.rdt) return;
  safe(() => window.rdt!('track', name, params));
}

/** Bing UET custom event. */
export function bingEvent(name: string, params?: Record<string, unknown>): void {
  if (!PIXELS.bingId || typeof window === 'undefined' || !Array.isArray(window.uetq)) return;
  safe(() => window.uetq!.push('event', name, params ?? {}));
}

export function bingPageView(): void {
  if (!PIXELS.bingId || typeof window === 'undefined' || !Array.isArray(window.uetq)) return;
  safe(() => window.uetq!.push('pageLoad'));
}
