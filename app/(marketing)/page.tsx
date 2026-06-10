/**
 * `/` (home): Chippi homepage on the calm, paper-flat site system.
 *
 * One scrolling experience that says the idea once and shows it:
 *   promise (hero) → proof (Chippi working) → trust (you approve every send)
 *   → the ask (start the trial).
 *
 * Replaces the old eight-section "studio ASCII" home (ASCII hero, gradient
 * cards, agent-showcase, how-it-works, fabricated testimonials, about, ASCII
 * CTA), which told the same loop four times and shipped fake social proof and
 * a "free, no card" promise the business doesn't honor.
 *
 * Auth users bounce straight to their workspace (unchanged auth wiring).
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/site/home/hero';
import { Proof } from '@/components/marketing/site/home/proof';
import { Trust } from '@/components/marketing/site/home/trust';
import { CTA } from '@/components/marketing/site/home/cta';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div className="bg-background text-foreground">
      <Hero />
      <Proof />
      <Trust />
      <CTA />
    </div>
  );
}
