/**
 * Twitter card image, same artwork as opengraph-image.tsx so the preview
 * is identical whether the link is shared on Twitter, Slack, LinkedIn, or
 * an iMessage. Re-exports the default OG generator to keep them in sync.
 */

export { default } from './opengraph-image';

// Next.js statically analyzes metadata route config and cannot follow
// re-exports for these fields. Keep the literals in this file so the Twitter
// image uses the intended edge runtime without emitting a production-build
// warning. A contract test keeps these values aligned with opengraph-image.
export const runtime = 'edge';
export const alt = 'Chippi · Agentic OS for real estate';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
