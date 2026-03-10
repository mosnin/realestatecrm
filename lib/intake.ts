import { protocol, rootDomain } from '@/lib/utils';

/**
 * Single source of truth for slug handling.
 * Chippi uses path slugs (`/apply/:slug`) and never host-based tenant URLs.
 */
export function normalizeSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export function isValidSlug(slug: string) {
  return slug.length >= 3 && normalizeSlug(slug) === slug;
}

export function buildIntakePath(slug: string) {
  return `/apply/${slug}`;
}

export function buildIntakeUrl(slug: string) {
  return `${protocol}://${rootDomain}${buildIntakePath(slug)}`;
}
