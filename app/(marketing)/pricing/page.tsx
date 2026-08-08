/**
 * `/pricing` — the CANONICAL American English base version. The page body
 * lives in components/marketing/pages/pricing-content.tsx, shared with the
 * localized routes (`/es/pricing`, `/ru/pricing` via app/[lang]/). Copy
 * changes belong in lib/i18n/dictionaries/pricing.ts (edit `en`, then update
 * every translation to match — the dictionary type enforces the key set).
 */

import { PricingContent } from '@/components/marketing/pages/pricing-content';
import { PRICING_DICTS } from '@/lib/i18n/dictionaries/pricing';
import { hreflangAlternates } from '@/lib/i18n/metadata';

export const metadata = {
  title: PRICING_DICTS.en.metaTitle,
  alternates: hreflangAlternates('/pricing', 'en'),
};

export default function PricingPage() {
  return <PricingContent lang="en" />;
}
