/**
 * `/` — Chippi marketing homepage (foundation stub).
 *
 * Authenticated visitors still bounce to their workspace via the existing
 * /auth/redirect entry — this preserves the prior `app/page.tsx` behavior
 * for logged-in realtors. Unauthenticated visitors see the marketing site.
 *
 * The polished homepage lands in PR `claude/marketing-home`; this stub
 * proves the route group resolves and renders the foundation chrome.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <>
      <MarketingHero
        eyebrow="The agentic OS for real estate"
        title="Chippi runs your workspace."
        sub="An AI agent that qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current. So you can focus on the deals that matter."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See how it works', href: '/features/chippi' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Homepage hero video — autoplay-mute-loop, ~30s, showing Chippi at work across the workspace (inbox → draft → tour scheduled → deal updated)."
        />
      </MarketingHero>

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days, no credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales', href: '/about' }}
      />
    </>
  );
}
