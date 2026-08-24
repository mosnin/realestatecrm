/**
 * `/chippi`, the flagship "Meet Chippi" page. Server component (exports
 * metadata). Same cinematic layout as the rest of the redesign: a sub-hero +
 * the three core showcases (the OS, the agent dashboard, the brokerage
 * dashboard) in a forced-dark wrapper, a compact pricing teaser, then the
 * light/dark-adaptive closing CTA.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import {
  ChippiReadsShowcase,
  ChippiDecidesShowcase,
  ChippiActsShowcase,
} from '@/components/marketing/giga/chippi-showcases';
import { PricingTeaser } from '@/components/marketing/giga/pricing-teaser';
import { CtaSection } from '@/components/marketing/giga/cta';
import { MARKETING_PAGE_DICTS } from '@/lib/i18n/dictionaries/marketing-pages';
import { getRequestLang } from '@/lib/i18n/request';
import { isAnnualAvailable } from '@/lib/plans';
import type { Metadata } from 'next';

const FEATURE_ICONS = ['Inbox', 'MessagesSquare', 'CalendarCheck'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = MARKETING_PAGE_DICTS[await getRequestLang()].chippi;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function MeetChippiPage() {
  const lang = await getRequestLang();
  const t = MARKETING_PAGE_DICTS[lang].chippi;
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label={t.hero.label}
          labelIcon="LayoutGrid"
          headline={
            <>
              {t.hero.headline[0]}
              <br className="hidden sm:block" /> {t.hero.headline[1]}
            </>
          }
          description={t.hero.description}
          features={[
            { ...t.hero.features[0]!, icon: FEATURE_ICONS[0] },
            { ...t.hero.features[1]!, icon: FEATURE_ICONS[1] },
            { ...t.hero.features[2]!, icon: FEATURE_ICONS[2] },
          ]}
          image="/marketing/chippi-hero.jpg"
          variant="chippi"
          mockupSrc="/marketing/hero/chippi-dashboard.svg"
          mockupAlt={t.hero.mockupAlt}
        />
        {lang === 'en' ? (
          <>
            <ChippiReadsShowcase />
            <ChippiDecidesShowcase />
            <ChippiActsShowcase />
          </>
        ) : null}
        <PricingTeaser
          lang={lang}
          annualEnabled={isAnnualAvailable('solo') && isAnnualAvailable('team')}
          headline={
            <>
              {t.pricingHeadline[0]}
              <br className="hidden sm:block" /> {t.pricingHeadline[1]}
            </>
          }
          plans={[
            { id: 'solo' },
            { id: 'team', featured: true },
          ]}
        />
      </div>
      <CtaSection lang={lang} />
    </>
  );
}
