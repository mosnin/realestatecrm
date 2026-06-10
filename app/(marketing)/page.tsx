/**
 * `/` (home): Chippi homepage on the calm site system.
 *
 * An editorial scroll that says the idea once and shows the product:
 *   promise (hero + workspace shot) → integrations → the loop as alternating
 *   feature rows → the breadth (bento) → an honest metrics band → the
 *   enterprise-trust band → the belief → the ask.
 *
 * Image placeholders (hero, feature rows, studio) are labeled slots for real
 * screenshots. Auth users bounce straight to their workspace (unchanged).
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/site/home/hero';
import { Logos } from '@/components/marketing/site/home/logos';
import { Features } from '@/components/marketing/site/home/features';
import { Bento } from '@/components/marketing/site/home/bento';
import { Metrics } from '@/components/marketing/site/home/metrics';
import { Enterprise } from '@/components/marketing/site/home/enterprise';
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
      <Logos />
      <Features />
      <Bento />
      <Metrics />
      <Enterprise />
      <Trust />
      <CTA />
    </div>
  );
}
