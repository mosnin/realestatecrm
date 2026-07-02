import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Security response headers applied to every route. The CSP (below) carries a
 * complete third-party allowlist and ships report-only; see the note on that
 * header for why it isn't enforced yet and how to flip it on.
 */
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
  // Content Security Policy.
  //
  // Shipped as report-only (not enforced) on purpose. The allowlist below is
  // deliberately COMPLETE — every third party the app actually loads is
  // enumerated: Clerk (auth), Stripe (checkout), Supabase (data + realtime),
  // Sentry (errors), Calendly (embeds), Google Maps (property maps), Ably
  // (realtime notifications), and the full set of public-page marketing/
  // analytics pixels (Meta, TikTok, Google Ads/Analytics, X/Twitter, LinkedIn,
  // Snapchat — see components/tracking-pixels.tsx). That makes the policy
  // "enforce-ready": flip the header key to `Content-Security-Policy` to turn
  // it on.
  //
  // It is NOT flipped here because enforcement can only be validated against a
  // running deploy (Clerk's auth widgets, Stripe's iframe, Maps, and realtime
  // all fail silently-then-loudly if a directive is a hair too tight), and this
  // build environment can't exercise those flows. Report-only lets the browser
  // POST violations without breaking anything, so the remaining gaps surface as
  // telemetry rather than as an outage for a paying realtor mid-checkout.
  // ENFORCEMENT IS THE #1 PREVIEW-VERIFICATION ITEM: on the PR's Vercel
  // preview, exercise sign-in, checkout, a property map, and live
  // notifications, confirm the report-only console is clean, then swap the key.
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://assets.calendly.com https://maps.googleapis.com https://connect.facebook.net https://analytics.tiktok.com https://www.googletagmanager.com https://www.google-analytics.com https://static.ads-twitter.com https://snap.licdn.com https://sc-static.net https://cdn.amplitude.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.com https://assets.calendly.com https://fonts.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com https://*.stripe.com https://images.unsplash.com https://*.calendly.com https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://www.facebook.com https://www.google-analytics.com https://analytics.tiktok.com https://px.ads.linkedin.com https://t.co",
      "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://calendly.com https://*.calendly.com https://maps.googleapis.com https://*.ably.io wss://*.ably.io https://*.ably-realtime.com wss://*.ably-realtime.com https://connect.facebook.net https://www.facebook.com https://analytics.tiktok.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://static.ads-twitter.com https://analytics.twitter.com https://px.ads.linkedin.com https://tr.snapchat.com https://api2.amplitude.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://calendly.com https://*.calendly.com https://td.doubleclick.net https://www.facebook.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // jsdom (via isomorphic-dompurify on the server) ships a runtime CSS
  // file. Webpack bundling rewrites the relative path so the file can't
  // be found at request time, crashing /apply/[slug]/privacy's page-data
  // collection with ENOENT default-stylesheet.css. Excluding the package
  // makes Next.js require() it from node_modules instead, with intact
  // relative paths.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],
  // Marketing redesign ships local placeholder imagery today. Unsplash is
  // allowlisted so the founder can drop in royalty-free architecture/interior
  // photos by URL later (the marketing tags are plain <img>, but this also
  // covers any next/image swap and matches the CSP img-src above).
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },
  // Lint + type-check run in CI (the `lint-typecheck-test` job, on every PR)
  // before anything reaches main. Re-running them inside `next build` on
  // Vercel's 8GB machine is redundant and was the cause of an Out-Of-Memory
  // kill during the post-compile "checking validity of types" phase (the build
  // compiled fine, then got SIGKILL'd before writing routes-manifest.json).
  // Skip them in the deploy build; CI stays the gate that blocks bad types.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Build-memory headroom. The app outgrew a comfortable fit on Vercel's 8GB
  // build container: static generation across 300+ routes (each parallel worker
  // holds the compiled app) plus Sentry sourcemap bundling peaked into an OOM
  // SIGKILL before routes-manifest.json was written. `webpackMemoryOptimizations`
  // trims webpack's peak heap; `cpus` caps how many static-generation workers run
  // in parallel. Lower peak RAM, slower build. If Vercel "Enhanced Builds" (a
  // larger machine) is enabled, `cpus` can be raised again.
  experimental: {
    webpackMemoryOptimizations: true,
    cpus: 2,
  },
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
      // Widening re-processes every client chunk for sourcemaps, which piled
      // onto the build's peak memory on the way to the OOM. Off keeps the
      // upload lean; stacktraces still resolve from the per-chunk maps we ship.
      widenClientFileUpload: false,
      disableLogger: true,
      automaticVercelMonitors: true,
    })
  : nextConfig;
