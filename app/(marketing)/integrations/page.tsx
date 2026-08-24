/**
 * `/integrations`, the connect-your-stack story. Server component (exports
 * metadata). Same layout as /agents and /brokerages: a cinematic hero +
 * showcases in a forced-dark wrapper, then a light/dark-adaptive closing CTA.
 *
 * Grounded in the real apps Chippi connects to through Composio (inbox,
 * calendar, CRM, messaging). We do not list on MLS or certify e-sign.
 */

import { SubHero } from '@/components/marketing/giga/sub-hero';
import { IntegrationsShowcase } from '@/components/marketing/giga/integrations-showcase';
import { IntegrationsDrift } from '@/components/marketing/giga/integrations-drift';
import {
  IntegrationsSetupShowcase,
  IntegrationsAutomationShowcase,
} from '@/components/marketing/giga/integrations-extra-showcases';
import { PricingTeaser } from '@/components/marketing/giga/pricing-teaser';
import { CtaSection } from '@/components/marketing/giga/cta';
import { MARKETING_PAGE_DICTS } from '@/lib/i18n/dictionaries/marketing-pages';
import { getRequestLang } from '@/lib/i18n/request';
import { isAnnualAvailable } from '@/lib/plans';
import type { Metadata } from 'next';

const FEATURE_ICONS = ['Mail', 'Users', 'MessagesSquare'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = MARKETING_PAGE_DICTS[await getRequestLang()].integrations;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function IntegrationsPage() {
  const lang = await getRequestLang();
  const t = MARKETING_PAGE_DICTS[lang].integrations;
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <SubHero
          label={t.hero.label}
          labelIcon="Workflow"
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
          image="/marketing/integrations-hero.jpg"
          variant="integrations"
        />
        {lang === 'en' ? (
          <>
            <IntegrationsShowcase />
            <IntegrationsDrift />
            <IntegrationsSetupShowcase />
            <IntegrationsAutomationShowcase />
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
