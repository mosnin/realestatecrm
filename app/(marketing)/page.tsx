/**
 * `/` (home): the owner-directed composition, with air between every beat.
 *
 *   1. Hero — Supermi-reference pastel card under the site's floating pill
 *      nav, with the arcade.so demo slot at the card's bottom edge.
 *   2. FeaturesSplit — light open split: copy/stats/dark button beside the
 *      photo-framed dark glass workflow card.
 *   3. HowItWorks — the white shadow card: giant headline + three step cards.
 *   4. FeaturesDark — the dark glass five-card section.
 *
 * Layout law: feature sections never stack tight. Tones alternate (pastel →
 * open white → white card → dark card → black footer) and each section gets
 * generous vertical space so the page breathes. White canvas, per the owner.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/site/home/hero';
import { FeaturesSplit } from '@/components/marketing/site/home/features-split';
import { HowItWorks } from '@/components/marketing/site/home/how-it-works';
import { FeaturesDark } from '@/components/marketing/site/home/features-dark';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div>
      <Hero />

      {/* Open, light — air after the hero card */}
      <div className="pt-12 sm:pt-16">
        <FeaturesSplit />
      </div>

      {/* White shadow card — its own mt-24 keeps the gap generous */}
      <div className="px-4">
        <HowItWorks />
      </div>

      {/* Dark glass card — full tone break, big breathing room above */}
      <div className="mt-24 sm:mt-32">
        <FeaturesDark />
      </div>
    </div>
  );
}
