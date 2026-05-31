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
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { TITLE_FONT, SECTION_LABEL } from '@/lib/typography';

export const metadata = { title: 'About — Chippi' };

const STATS: { number: string; label: string }[] = [
  { number: '10×', label: 'First-touch faster' },
  { number: '45 min', label: 'Saved per realtor per day' },
  { number: '98%', label: 'Approval rate on Chippi drafts' },
  { number: '0', label: "Tabs you'll need to keep open" },
];

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

      {/* 3. Pull quote — inline serif Times quote with curly quotes. */}
      <section className="relative py-24 md:py-32">
        <div className="mx-auto max-w-3xl px-6 md:px-8 text-center">
          <p
            style={TITLE_FONT}
            className="text-3xl md:text-5xl leading-[1.15] tracking-[-0.01em] text-foreground"
          >
            {"“The work shouldn’t be the chrome. The work should be the deals.”"}
          </p>
          <p className={`${SECTION_LABEL} mt-8`}>Chippi product principles</p>
        </div>
      </section>

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

      {/* 7. Stat row — inline 4-col, serif numbers + small-caps labels. */}
      <section className="relative py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6 md:px-8">
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-12">
            {STATS.map((s) => (
              <li key={s.label} className="text-center md:text-left">
                <p
                  style={TITLE_FONT}
                  className="text-[44px] md:text-[56px] leading-none tracking-[-0.02em] text-foreground tabular-nums"
                >
                  {s.number}
                </p>
                <p className={`${SECTION_LABEL} mt-4`}>{s.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
