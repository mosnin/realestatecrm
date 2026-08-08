/**
 * Shared SEO plumbing for localized marketing pages: canonical + hreflang
 * alternates so each language version indexes on its own URL (Google crawls
 * from US IPs and must never need the geo redirect to discover a language).
 * Relative URLs resolve against the root layout's metadataBase.
 */

import type { Metadata } from 'next';
import { LANG_TAG, LANGS, localizedPath, type Lang } from './markets';

export function hreflangAlternates(basePath: string, lang: Lang): Metadata['alternates'] {
  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[LANG_TAG[l]] = localizedPath(basePath, l);
  // The American English base version is the default for unmatched locales.
  languages['x-default'] = basePath;
  return { canonical: localizedPath(basePath, lang), languages };
}
