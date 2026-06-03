import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Content Security Policy — single source of truth.
 *
 * This policy is emitted TWICE below: once as the enforcing
 * `Content-Security-Policy` header (blocks violations) and once as
 * `Content-Security-Policy-Report-Only` (keeps logging violations so a
 * source we missed still surfaces in the browser console / Sentry instead of
 * just breaking silently). Keep them in lockstep — change here, both update.
 *
 * Conservative by design: a missing source breaks production, so when in
 * doubt the source is INCLUDED with a comment. Every directive below is
 * grounded in an actual loader in the codebase (grep'd, not guessed):
 *
 *   - Clerk auth        → script/connect/frame/img/style: *.clerk.accounts.dev, *.clerk.com, img.clerk.com
 *   - Stripe billing    → js.stripe.com (script/frame), api.stripe.com (connect), hooks.stripe.com (frame), *.stripe.com (img)
 *   - Cloudflare Turnstile (Clerk bot defense) → challenges.cloudflare.com (script/frame)
 *   - Supabase          → *.supabase.co (connect) + wss://*.supabase.co (realtime)
 *   - Sentry ingest     → sentry.io, *.sentry.io, *.ingest.sentry.io, *.ingest.us.sentry.io (connect)
 *   - Vercel            → *.vercel.app, vercel.live + wss (Speed Insights / Live feedback) (connect/script/frame)
 *   - Amplitude         → *.amplitude.com (analytics + session replay; loaded app-wide via AmplitudeProvider)
 *   - Google fonts CDN  → fonts.googleapis.com (style), fonts.gstatic.com (font)
 *   - jsDelivr fonts    → cdn.jsdelivr.net (font; Inter/Tinos via @vercel/og + fontsource)
 *   - Wasabi S3 storage → *.wasabisys.com + custom WASABI_PUBLIC_BASE_URL (img/media/frame: file previews)
 *   - Supabase storage  → *.supabase.co (img/media: signed file URLs)
 *   - Unsplash          → images.unsplash.com (img: marketing/testimonial photos)
 *   - Google Maps       → maps.googleapis.com (img: static map tiles)
 *   - FirstPromoter     → cdn.firstpromoter.com (script: affiliate attribution on marketing pages)
 *   - Tenant tracking pixels (user-configured, public site pages — see components/tracking-pixels.tsx):
 *       Meta/Facebook  → connect.facebook.net (script), www.facebook.com (img)
 *       TikTok         → analytics.tiktok.com (script)
 *       Google (GA/Ads/Tag Mgr) → www.googletagmanager.com, www.google-analytics.com,
 *                                  googleads.g.doubleclick.net, www.google.com (script/img)
 *       Twitter/X      → static.ads-twitter.com (script)
 *       LinkedIn       → snap.licdn.com (script)
 *       Snapchat       → sc-static.net (script)
 *       HubSpot        → js.hs-scripts.com, js.hs-analytics.net (script)
 *       Microsoft Clarity → www.clarity.ms (script)
 *       Segment        → cdn.segment.com (script)
 *
 * Notable allowances and what to watch on the Vercel preview:
 *   - `script-src 'unsafe-inline'`: REQUIRED. Next.js injects inline bootstrap
 *     scripts, the no-flash theme script in app/layout.tsx is inline, and the
 *     tenant tracking pixels render inline <script> via dangerouslySetInnerHTML.
 *     We cannot nonce these without rewriting all of them, so 'unsafe-inline'
 *     stays. (No 'unsafe-eval' — add it only if a WASM/eval lib breaks.)
 *   - `style-src 'unsafe-inline'`: REQUIRED. Tailwind/Next inject inline styles
 *     and styled components set style attributes everywhere.
 *   - `img-src https:`: the BROADEST call. File previews and tenant pixel <img>
 *     beacons hit arbitrary user/storage hosts; rather than chase every one, we
 *     allow any HTTPS image. Watch here first if images break.
 *   - `connect-src`: the directive most likely to bite. If a fetch/XHR/WebSocket
 *     to a host not listed gets blocked, it shows up here. Watch the console.
 *   - `frame-ancestors 'self'`: mirrors the existing X-Frame-Options: SAMEORIGIN.
 *     NOTE: the booking embed (app/book/[slug]/embed) is meant to be iframed on
 *     external sites, but cross-origin embedding is ALREADY blocked today by
 *     X-Frame-Options: SAMEORIGIN — this CSP does not change that behavior.
 */
const cspDirectives = [
  "default-src 'self'",
  // Scripts: Next bootstrap + inline theme/pixel scripts (unsafe-inline), Stripe,
  // Clerk, Cloudflare Turnstile, Vercel (live + insights), Amplitude, FirstPromoter,
  // jsDelivr, and every tenant analytics/pixel vendor we render.
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://*.vercel.app https://vercel.live https://va.vercel-scripts.com https://*.amplitude.com https://cdn.jsdelivr.net https://cdn.firstpromoter.com https://connect.facebook.net https://analytics.tiktok.com https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.google.com https://static.ads-twitter.com https://snap.licdn.com https://sc-static.net https://js.hs-scripts.com https://js.hs-analytics.net https://www.clarity.ms https://cdn.segment.com",
  // Styles: Next/Tailwind inline styles + Google Fonts + Clerk.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.com",
  // Fonts: self, Google Fonts, jsDelivr (fontsource Inter/Tinos).
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  // Images: allow any HTTPS source — file previews + tenant pixel beacons hit
  // arbitrary storage/vendor hosts. data: + blob: for inline/generated images.
  "img-src 'self' data: blob: https:",
  // Media: audio/video file previews from Supabase + Wasabi storage.
  "media-src 'self' blob: https://*.supabase.co https://*.wasabisys.com",
  // Network: Stripe, Clerk, Supabase (+ realtime wss), Sentry ingest, Vercel
  // (insights + live feedback wss), Amplitude (events + session replay).
  "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.supabase.co wss://*.supabase.co https://sentry.io https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.vercel.app https://vercel.live wss://vercel.live https://va.vercel-scripts.com https://*.amplitude.com",
  // Frames: Stripe checkout/3DS, Clerk, Turnstile, Vercel live, file-preview
  // iframes (PDFs etc.) from Supabase + Wasabi storage.
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://vercel.live https://*.supabase.co https://*.wasabisys.com",
  // Web workers (Next, session replay) — self + blob.
  "worker-src 'self' blob:",
  // Lock down the dangerous bits.
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Mirror the existing X-Frame-Options: SAMEORIGIN (cross-origin embedding
  // is already blocked today by that header; this just states it in CSP too).
  "frame-ancestors 'self'",
];

const cspValue = cspDirectives.join('; ');

const securityHeaders = [
  // Prevent embedding in iframes from other origins (clickjacking)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer info sent to cross-origin requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unused browser features (microphone allowed for voice mode)
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=()' },
  // Force HTTPS for 2 years (only active when served over TLS)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Enforcing CSP — blocks anything not in the allowlist above.
  { key: 'Content-Security-Policy', value: cspValue },
  // Report-only copy of the SAME policy — keeps violations logging so a
  // source we missed surfaces in the console instead of only blocking.
  { key: 'Content-Security-Policy-Report-Only', value: cspValue },
];

const nextConfig: NextConfig = {
  // jsdom (via isomorphic-dompurify on the server) ships a runtime CSS
  // file. Webpack bundling rewrites the relative path so the file can't
  // be found at request time, crashing /apply/[slug]/privacy's page-data
  // collection with ENOENT default-stylesheet.css. Excluding the package
  // makes Next.js require() it from node_modules instead, with intact
  // relative paths.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

/**
 * Wrap with Sentry — but ONLY when the full build-plugin credential set is
 * present (org + project + auth token). The Sentry↔Vercel integration injects
 * SENTRY_AUTH_TOKEN automatically; if org/project aren't also set, the plugin
 * still attempts an authenticated sourcemap upload and FAILS the production
 * build. Gating on all three means: configured → upload sourcemaps; not
 * configured → plain build that never fails on Sentry. The runtime SDK is
 * independent of this (it loads via instrumentation*.ts, DSN-gated), so error
 * capture still works whenever NEXT_PUBLIC_SENTRY_DSN is set.
 */
const sentryBuildConfigured = Boolean(
  process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT &&
    process.env.SENTRY_AUTH_TOKEN,
);

export default sentryBuildConfigured
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      automaticVercelMonitors: true,
    })
  : nextConfig;
