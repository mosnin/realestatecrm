/**
 * Localized marketing tree (`/es/...`, `/ru/...`).
 *
 * Wraps the localized pages in the SAME marketing shell as the English site
 * (one layout, one brand) and 404s any `[lang]` segment that isn't a shipped
 * language — this is the guard that stops the root-level dynamic segment from
 * swallowing arbitrary single-segment paths (`/whatever` → notFound, exactly
 * as before this tree existed).
 *
 * Static routes always win over this dynamic segment, so `/s/...`, `/admin`,
 * `/pricing` etc. are untouched.
 */

import { notFound } from 'next/navigation';
import { isLang, LANGS } from '@/lib/i18n/markets';
import MarketingShell from '../../(marketing)/layout';

export function generateStaticParams() {
  // Only the non-default languages live under /[lang]; English is unprefixed.
  return LANGS.filter((l) => l !== 'en').map((lang) => ({ lang }));
}

export default async function LocalizedMarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang) || lang === 'en') notFound();
  return <MarketingShell lang={lang}>{children}</MarketingShell>;
}
