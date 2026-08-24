/**
 * `/agents`, the solo-agent story. Server component (exports metadata). The
 * cinematic hero + showcases live in a forced-dark wrapper (they're built for a
 * dark canvas); the closing CTA stays light/dark-adaptive like the home page.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import { AgentInboxShowcase, AgentPipelineShowcase } from '@/components/marketing/giga/agents-showcases';
import { ContentShowcase } from '@/components/marketing/giga/content-showcase';
import { PricingTeaser } from '@/components/marketing/giga/pricing-teaser';
import { CtaSection } from '@/components/marketing/giga/cta';
import { MARKETING_PAGE_DICTS } from '@/lib/i18n/dictionaries/marketing-pages';
import { getRequestLang } from '@/lib/i18n/request';
import { isAnnualAvailable } from '@/lib/plans';
import type { Metadata } from 'next';

const FEATURE_ICONS = ['MessagesSquare', 'KanbanSquare', 'CalendarCheck'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = MARKETING_PAGE_DICTS[await getRequestLang()].agents;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function AgentsPage() {
  const lang = await getRequestLang();
  const t = MARKETING_PAGE_DICTS[lang].agents;
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
          image="/marketing/agents-hero.jpg"
          variant="inbox"
          mockupSrc="/marketing/hero/agents-dashboard.svg"
          mockupAlt={t.hero.mockupAlt}
        />
        {lang === 'en' ? (
          <>
            <AgentInboxShowcase />
            <ContentShowcase />
            <AgentPipelineShowcase />
          </>
        ) : null}
        <PricingTeaser
          lang={lang}
          annualEnabled={isAnnualAvailable('solo') && isAnnualAvailable('pro')}
          headline={
            <>
              {t.pricingHeadline[0]}
              <br className="hidden sm:block" /> {t.pricingHeadline[1]}
            </>
          }
          plans={[
            { id: 'solo' },
            { id: 'pro', featured: true },
          ]}
        />
      </div>
      <CtaSection lang={lang} />
    </>
  );
}
