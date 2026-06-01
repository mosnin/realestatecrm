/**
 * `/about` — About Chippi.
 *
 * The page where the brand voice is most exposed. Apple's about page is
 * dense reading with strong typography and quiet imagery. No founders'
 * journey video. No photo carousel. No "our values" with icon-and-paragraph
 * rows. Words carry the page.
 *
 * Voice rules on this surface:
 * - Lowercase verbs. Periods at end of sentences.
 * - No exclamation marks anywhere.
 * - No marketing-speak ("revolutionary", "transformative", "AI-powered").
 * - Brand orange does not decorate this page.
 * - All media is a MarketingMediaSlot — no stock photos, no posed founder
 *   headshots.
 *
 * The pull-quote and stat-row blocks use the shared marketing primitives
 * (`MarketingQuote`, `MarketingStatRow`) so every page renders the same
 * typographic moments the same way. The primitives carry their own
 * vertical breath — no extra section wrappers needed.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { MarketingQuote } from '@/components/marketing/marketing-quote';

export const metadata = { title: 'About — Chippi' };

export default function AboutPage() {
  return (
    <>
      {/* 1. Hero */}
      <MarketingHero
        eyebrow="ABOUT"
        title={"Built for the realtor who's tired of tabs."}
        sub={
          "Chippi is the agentic OS for real-estate agents and brokerages. We built it because the work shouldn't be the chrome — the work should be the deals."
        }
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="wide"
          description="About hero — a horizontal photograph of the team or the office. Calm, paper-flat, no posed corporate look."
        />
      </MarketingHero>

      {/* 2. The one idea — words are the point. */}
      <MarketingSection
        stacked
        eyebrow="THE ONE IDEA"
        title="An agent that runs the room."
        sub="Real estate work is mostly attention management. Email, calendar, replies, follow-ups, pipeline updates. The actual selling — listening, judging, knowing — happens in maybe ten percent of the day. We built an agent to handle the other ninety."
      />

      {/* 3. Pull quote — typographic moment, no card chrome. */}
      <MarketingQuote
        quote={"“The work shouldn’t be the chrome. The work should be the deals.”"}
        attribution="Chippi product principles"
      />

      {/* 4. What we believe — first belief. */}
      <MarketingSection
        stacked
        eyebrow="WHAT WE BELIEVE"
        title="Configuration is failure to decide."
        sub="Settings, toggles, customization layers — they're admissions the team couldn't pick. Picking is the work. Every plate that's loaded with options is a plate the customer has to sort out themselves. We refuse to make our customer's day harder so our team's product spec was easier."
      />

      {/* 5. Second belief — side-by-side with approval panel. */}
      <MarketingSection
        side="right"
        eyebrow="WHAT WE BELIEVE"
        title="The agent asks before it acts."
        sub="Chippi never autonomously sends mail, books a tour, or changes a record. By default, every move is yours to approve. You can grant per-tool autonomy later — but the default is humans in the loop, and that's where the trust lives."
      >
        <MarketingMediaSlot
          aspect="square"
          description="Approval panel screenshot — pending action with Approve and Decline buttons."
        />
      </MarketingSection>

      {/* 6. Third belief — side-by-side with signature triptych. */}
      <MarketingSection
        side="left"
        eyebrow="WHAT WE BELIEVE"
        title="Chippi has one voice."
        sub="Wherever Chippi appears — a draft card, a toast, an activity row — the same orange-on-serif signature carries through. Nothing else does. It's how the realtor learns to trust the agent across surfaces."
      >
        <MarketingMediaSlot
          aspect="square"
          description="Three small product moments side-by-side showing the Chippi signature — composer, toast, activity row."
        />
      </MarketingSection>

      {/* 7. Fourth belief — replaces the made-up stat row. We don't ship
              marketing-claim numbers dressed as data; when there's a number
              worth quoting, we'll measure it and footnote it. Until then,
              the page closes with another belief. */}
      <MarketingSection
        stacked
        eyebrow="WHAT WE BELIEVE"
        title="No numbers we can't defend."
        sub="No 10× headline. No 45-minutes-saved-per-day claim. The day Chippi can prove a number against a customer's own data, we'll quote it — and footnote it. Until then, we let the agent do the talking."
      />

      {/* 8. CTA */}
      <MarketingCTA
        title="Try Chippi."
        sub="Seven days. No credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to us', href: '/about' }}
      />
    </>
  );
}
