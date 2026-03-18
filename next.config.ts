import type { NextConfig } from "next";

/**
 * Security response headers applied to every route.
 *
 * CSP NOTE: When Stripe is wired up, add these to connect-src:
 *   https://api.stripe.com
 * and to frame-src:
 *   https://js.stripe.com https://hooks.stripe.com
 * and to script-src:
 *   https://js.stripe.com
 */
const securityHeaders = [
  // Prevent embedding in iframes from other origins (clickjacking)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer info sent to cross-origin requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unused browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Force HTTPS for 2 years (only active when served over TLS)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // CSP is enforced via middleware.ts (Content-Security-Policy header).
  // It is set there rather than here so Clerk's origin needs can be
  // handled dynamically per-request if needed in the future.
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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

export default nextConfig;
