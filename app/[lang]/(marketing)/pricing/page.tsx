/**
 * `/es/pricing`, `/ru/pricing` — localized pricing pages. Same shared body as
 * the canonical English `/pricing`; only the dictionary differs. Statically
 * generated per language (currency localizes client-side per visitor).
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { PricingContent } from '@/components/marketing/pages/pricing-content';
import { PRICING_DICTS } from '@/lib/i18n/dictionaries/pricing';
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
    title: PRICING_DICTS[lang].metaTitle,
    description: PRICING_DICTS[lang].metaDescription,
    alternates: hreflangAlternates('/pricing', lang),
  };
}

export default async function LocalizedPricingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLang(lang) || lang === 'en') notFound();
  return <PricingContent lang={lang} />;
}
