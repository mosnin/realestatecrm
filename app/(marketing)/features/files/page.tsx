/**
 * `/features/files` — Files.
 *
 * The file room belongs to the deal. Browse → preview → versioned.
 * Hero → browser → preview → history → promise → CTA. Voice is lowercase
 * verbs and periods, no exclamation.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingMediaSlot } from '@/components/marketing/marketing-media-slot';
import { MarketingCTA } from '@/components/marketing/marketing-cta';

export const metadata = { title: 'Files — Chippi' };

export default function FeaturesFilesPage() {
  return (
    <>
      {/* Silent hero — Files is the quietest surface in Chippi. Apple varies
          the rhythm by letting some pages land with type alone; this is that
          page. The grid + previews below carry the visual weight. */}
      <MarketingHero
        eyebrow="FILES"
        title="A file room for the deal."
        sub="Documents, photos, contracts, signed PDFs — organized per-deal, searchable, with version history."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See all features', href: '/features' }}
      />

      <MarketingSection
        side="right"
        eyebrow="THE BROWSER"
        title="Folders that follow the deal."
        sub="Folders per deal, files per touchpoint. Grid view or list view. Searchable across the whole workspace."
        bullets={[
          'Grid or list.',
          'Per-deal folders.',
          'Full-text search.',
        ]}
      >
        <MarketingMediaSlot
          aspect="wide"
          description="Files browser — sidebar of folders, grid of files."
        />
      </MarketingSection>

      <MarketingSection
        side="left"
        eyebrow="PREVIEW"
        title="Open it without leaving."
        sub="PDFs, images, docs — preview in the side panel. Annotate, share, request signature. Then back to the work."
        bullets={[
          'Inline PDF + image preview.',
          'Annotate without download.',
          'Share link with expiry.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="File preview side panel — PDF rendered, annotation toolbar."
        />
      </MarketingSection>

      <MarketingSection
        side="right"
        eyebrow="HISTORY"
        title="Versioned, not overwritten."
        sub="Upload a new version; the old one stays. Open the version that matters. Pin the final."
        bullets={[
          'Versioning per file.',
          'Diff between versions.',
          'Pin the final version per deal.',
        ]}
      >
        <MarketingMediaSlot
          aspect="square"
          description="Version list — old versions with timestamp, pinned-final marker."
        />
      </MarketingSection>

      <MarketingSection
        stacked
        eyebrow="THE PROMISE"
        title="Documents that belong to the deal."
        sub="Not next to it. Inside it."
      />

      <MarketingCTA
        title="Move your files into Chippi."
        sub="Drag and drop. Chippi files them by deal."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'See pricing', href: '/pricing' }}
      />
    </>
  );
}
