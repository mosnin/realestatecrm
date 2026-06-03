import type { MetadataRoute } from 'next';

/**
 * Marketing-site base URL. Prefer NEXT_PUBLIC_SITE_URL; fall back to the
 * production marketing host. Public root (usechippi.com), not the app
 * subdomain.
 */
const BASE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://usechippi.com'
).replace(/\/$/, '');

type ChangeFrequency = NonNullable<
  MetadataRoute.Sitemap[number]['changeFrequency']
>;

/**
 * Public marketing routes only — mirrors the page tree under
 * `app/(marketing)/**`. Authenticated (`/s`, `/broker`), setup, auth,
 * billing, and API routes are intentionally excluded (see robots.ts).
 */
const ROUTES: ReadonlyArray<{
  path: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}> = [
  // Top-level
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/pricing', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/realtors', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/status', changeFrequency: 'daily', priority: 0.4 },

  // Features
  { path: '/features', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/features/calendar', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features/chippi', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features/communication', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features/deals', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features/files', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features/people', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features/properties', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/features/studio', changeFrequency: 'monthly', priority: 0.7 },

  // Teams
  { path: '/teams', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/teams/analytics', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/teams/chat', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/teams/leads', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/teams/members', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/teams/templates', changeFrequency: 'monthly', priority: 0.6 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
