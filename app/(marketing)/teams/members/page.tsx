/**
 * `/teams/members` — Team members (foundation stub).
 *
 * The polished version lands in PR `claude/marketing-teams-members` — that PR
 * replaces this stub. Don't refactor here; replace.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Members — Chippi' };

export default function TeamsMembersPage() {
  return (
    <>
      <MarketingHero
        eyebrow={'Team members'}
        title={'Manage who belongs.'}
        sub={"Invite realtors, set roles, see what they're working on. Members keep their own workspace; admins see the whole floor."}
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description={'Members table — realtor avatars, role pills, last-active timestamps.'}
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
