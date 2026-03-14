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
  // Content Security Policy
  // 'unsafe-inline' on script-src is required by Next.js inline scripts and Clerk.
  // 'unsafe-eval' is required by Clerk and some animation libraries in dev.
  // Tighten further once a nonce-based approach is viable.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Clerk loads its component JS from *.clerk.accounts.dev AND *.clerk.com (prod).
      // Cloudflare Turnstile (bot protection used by Clerk) loads from challenges.cloudflare.com.
      // *.lcl.dev covers Clerk's local tunnel for dev environments.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.clerk.accounts.dev https://clerk.accounts.dev https://*.clerk.com https://clerk.com https://challenges.cloudflare.com https://*.lcl.dev",
      "style-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com",
      "img-src 'self' blob: data: https://*.clerk.accounts.dev https://*.clerk.com https://img.clerk.com https://*.gravatar.com https://images.unsplash.com https://blogger.googleusercontent.com",
      "font-src 'self' data: https://*.clerk.accounts.dev https://*.clerk.com",
      // Clerk makes API calls to its own domain; Supabase for DB; Vercel for analytics.
      "connect-src 'self' https://*.supabase.co https://*.clerk.accounts.dev https://clerk.accounts.dev https://*.clerk.com https://clerk.com https://api.clerk.com https://*.lcl.dev https://vitals.vercel-insights.com https://*.vercel-scripts.com",
      // Clerk renders its hosted UI in an iframe; Cloudflare Turnstile also uses an iframe.
      "frame-src 'self' https://*.clerk.accounts.dev https://clerk.accounts.dev https://*.clerk.com https://clerk.com https://challenges.cloudflare.com https://*.lcl.dev",
      "worker-src 'self' blob:",
      "form-action 'self'",
      "base-uri 'self'",
    ].join('; '),
  },
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
