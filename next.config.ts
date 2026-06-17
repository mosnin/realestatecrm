import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Security response headers applied to every route.
 *
 * Stripe domains are now included in the allowlists below (connect-src,
 * frame-src, script-src) via the CSP header — once a full CSP is added.
 * For now the CSP is omitted (see note below), but the domains are documented.
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
  // Content Security Policy (report-only — enforcing breaks Clerk auth components)
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://assets.calendly.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.clerk.com https://assets.calendly.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com https://*.stripe.com https://images.unsplash.com https://*.calendly.com",
      "connect-src 'self' https://api.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://calendly.com https://*.calendly.com",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://calendly.com https://*.calendly.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
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
