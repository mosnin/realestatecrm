/**
 * `/es`, `/ru` — language roots. The homepage isn't localized yet, so these
 * land on the language's pricing page (the first localized page) rather than
 * 404ing a typed-in URL. Replace with the localized homepage when its
 * dictionary ships.
 */

import { redirect, notFound } from 'next/navigation';
import { isLang, LANGS, localizedPath } from '@/lib/i18n/markets';

export function generateStaticParams() {
  return LANGS.filter((l) => l !== 'en').map((lang) => ({ lang }));
}

export default async function LocalizedHome({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang) || lang === 'en') notFound();
  redirect(localizedPath('/pricing', lang));
}
