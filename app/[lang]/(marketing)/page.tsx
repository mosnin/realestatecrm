/** Localized homepage mirrors for Spanish and Russian visitors. */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Hero } from '@/components/marketing/giga/hero';
import { Stats } from '@/components/marketing/giga/stats';
import { HomeMechanism } from '@/components/marketing/giga/home-mechanism';
import { CtaSection } from '@/components/marketing/giga/cta';
import { HOME_DICTS } from '@/lib/i18n/dictionaries/home';
import { hreflangAlternates } from '@/lib/i18n/metadata';
import { isLang, LANGS } from '@/lib/i18n/markets';

export function generateStaticParams() {
  return LANGS.filter((l) => l !== 'en').map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang) || lang === 'en') return {};
  return {
    title: HOME_DICTS[lang].metaTitle,
    description: HOME_DICTS[lang].metaDescription,
    alternates: hreflangAlternates('/', lang),
  };
}

export default async function LocalizedHome({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang) || lang === 'en') notFound();

  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <Hero lang={lang} />
        <Stats lang={lang} />
        <HomeMechanism lang={lang} />
      </div>
      <CtaSection lang={lang} />
    </>
  );
}
