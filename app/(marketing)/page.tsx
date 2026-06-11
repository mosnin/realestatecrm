/**
 * `/` (home): the owner-directed composition.
 *
 *   1. Hero — the Supermi-reference pastel card: in-card black pill nav,
 *      badge pill, giant display headline, white Get Started pill, and the
 *      arcade.so demo slot where the dashboard window sits.
 *   2. FeaturesDark — the owner-provided dark glass feature section (five
 *      glass cards with live mini-demos), tailored to Chippi.
 *   3. Black footer card (layout).
 *
 * Everything else was deleted on the owner's direction — no stock-photo
 * sections, no mock-UI panels. Auth users bounce to their workspace.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/site/home/hero';
import { FeaturesDark } from '@/components/marketing/site/home/features-dark';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <div>
      <Hero />
      <FeaturesDark />
    </div>
  );
}
