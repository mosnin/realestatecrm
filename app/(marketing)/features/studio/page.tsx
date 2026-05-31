/**
 * `/features/studio` — Studio.
 *
 * Make the content, ship the content. Generate → edit → schedule.
 * Hero → create → edit → schedule → promise → CTA. Voice is lowercase
 * verbs and periods, no exclamation.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Studio — Chippi' };

export default function FeaturesStudioPage() {
  return (
    <>
      <MarketingHero
        eyebrow="STUDIO"
        title="Make the content. Schedule the post."
        sub="Listing copy, one-pagers, social posts. Chippi generates; you approve; schedule to your channels."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      >
        <MarketingMediaSlot
          aspect="video"
          description="Studio — generate listing copy → preview → schedule to channels."
        />
      </MarketingHero>

      <MarketingSection
        side="right"
        eyebrow="CREATE"
        title="Generate. Preview. Approve."
        sub="From a property record, Chippi drafts the listing copy, the email blast, and the social post. You edit; you approve; you schedule."
        bullets={[
          'Listing copy from property data.',
          'Email blast templates.',
          'Social posts per channel.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Generate panel — input field, generate button, preview panel."
        />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="EDIT"
        title="The polished version, side-by-side."
        sub="Generated copy on the left. Your edits on the right. Diff highlighted so you see exactly what changed."
        bullets={[
          'Inline editor with diff.',
          'Per-channel character limits enforced.',
          'Tone slider for voice.',
        ]}
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Two-pane editor — generated vs edited, with diff markers."
        />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="SCHEDULE"
        title="When to post. Where to post."
        sub="Schedule to Instagram, Facebook, LinkedIn, and your email list. Calendar view shows what's queued."
        bullets={[
          'Multi-channel scheduling.',
          'Calendar view of queue.',
          'Auto-reschedule if a channel rejects.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Schedule panel — calendar, channels checkboxes, queue visualization."
        />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="Content that ships."
        sub="Drafts that don't sit in a Notes app for a week."
      />

      <MarketingCTA
        title="Make Studio work for you."
        sub="Connect your channels. Chippi takes it from there."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
