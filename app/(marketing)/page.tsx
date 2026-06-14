/**
 * `/` (home): the owner-directed composition, with air between every beat.
 *
 *   1. Hero, pastel card + arcade.so demo slot, under the pill nav.
 *   2. FeaturesSplit, open split: copy/stats beside the glass workflow card.
 *   3. LeadOrbit, animated brand-gradient card: the qualification loop.
 *   4. HowItWorks, white shadow card: giant headline + three step cards.
 *   5. StudioSection, pastel band: content + video, media placeholders.
 *   6. BriefingSection, the dark beat: the 7am morning briefing.
 *   7. FeaturesBento, soft white cards with owner image slots.
 *   8. FeaturesDark, pastel glass five-card feature section.
 *   9. BreadthBand, beyond the inbox: voice, deep work, memory, capture.
 *  10. ResultsStat, gray card: radial pipeline + honest 24/7 focal stat.
 *  11. CloudCta, sky band closer with the paper-plane + View Demo.
 *
 * Beats 5/6/9 close the audit's narrative gap (Studio, Briefing, breadth)
 * so the page reads as an agentic OS, not a single follow-up loop.
 *
 * Layout law: feature sections NEVER stack tight. Tones alternate (pastel →
 * open white → vermillion → white card → white → pastel glass → gray → sky →
 * pastel footer) and each beat gets generous vertical air. White canvas.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/site/home/hero';
import { FeaturesSplit } from '@/components/marketing/site/home/features-split';
import { LeadOrbit } from '@/components/marketing/site/home/lead-orbit';
import { HowItWorks } from '@/components/marketing/site/home/how-it-works';
import { StudioSection } from '@/components/marketing/site/home/studio-section';
import { BriefingSection } from '@/components/marketing/site/home/briefing-section';
import { FeaturesBento } from '@/components/marketing/site/home/features-bento';
import { FeaturesDark } from '@/components/marketing/site/home/features-dark';
import { BreadthBand } from '@/components/marketing/site/home/breadth-band';
import { ResultsStat } from '@/components/marketing/site/home/results-stat';
import { CloudCta } from '@/components/marketing/site/home/cloud-cta';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div>
      <Hero />

      {/* Open, light, air after the hero card */}
      <div className="pt-12 sm:pt-16">
        <FeaturesSplit />
      </div>

      {/* Animated brand-gradient orbit */}
      <div className="mt-24 sm:mt-32">
        <LeadOrbit />
      </div>

      {/* White shadow card, its own mt-24 keeps the gap generous */}
      <div className="px-4">
        <HowItWorks />
      </div>

      {/* Content studio, pastel band with media placeholders */}
      <div className="mt-24 sm:mt-32">
        <StudioSection />
      </div>

      {/* Morning briefing, the dark contrast beat */}
      <div className="mt-24 sm:mt-32">
        <BriefingSection />
      </div>

      {/* Soft bento, owner image slots, big air above */}
      <div className="mt-24 sm:mt-32">
        <FeaturesBento />
      </div>

      {/* Pastel glass card, tone shift, big breathing room above */}
      <div className="mt-24 sm:mt-32">
        <FeaturesDark />
      </div>

      {/* Beyond the inbox, breadth grid (voice, deep work, memory, capture) */}
      <div className="mt-24 sm:mt-32">
        <BreadthBand />
      </div>

      {/* Radial results, gray card, honest focal stat */}
      <div className="mt-24 sm:mt-32">
        <ResultsStat />
      </div>

      {/* Sky band closer before the footer */}
      <div className="mt-24 sm:mt-32">
        <CloudCta />
      </div>
    </div>
  );
}
