import type { MetadataRoute } from 'next';
import { LANGS, LOCALIZED_PATHS, localizedPath } from '@/lib/i18n/markets';

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
  // Core marketing pages
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/realtors', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/brokerages', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/integrations', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/pricing', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/company', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/demo', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/status', changeFrequency: 'daily', priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const entries = ROUTES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
  // Localized mirrors (`/es/pricing`, `/ru/pricing`, …) of every translated
  // marketing path — LOCALIZED_PATHS is the same registry the middleware's
  // language routing uses, so the sitemap can't advertise a translation that
  // doesn't exist (or miss one that does).
  for (const path of LOCALIZED_PATHS) {
    const base = ROUTES.find((r) => r.path === path);
    for (const lang of LANGS) {
      if (lang === 'en') continue; // unprefixed English entry already listed
      entries.push({
        url: `${BASE_URL}${localizedPath(path, lang)}`,
        lastModified,
        changeFrequency: base?.changeFrequency ?? 'monthly',
        priority: base?.priority ?? 0.7,
      });
    }
  }
  return entries;
}
