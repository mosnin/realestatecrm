'use client';

/**
 * Marketing nav — desktop mega menu panel.
 *
 * The full-width sheet that slides down from the sticky top-bar on hover.
 * Two shapes:
 *
 *   - "features" (4 columns): surfaces · for teams · also · media slot
 *   - "teams"    (4 columns): teams left · teams right · also · media slot
 *
 * Both panels share the same chrome — solid `bg-background`, hairline
 * bottom border, no shadow, no glassmorphism. Apple-flat. Motion is one
 * variant: opacity 0→1 + y 8→0 at 220ms ease-Apple. That's the discipline.
 *
 * Hover bridging is the parent's job — see `MarketingNav` for the grace
 * timer and the mouse-leaves-both-areas state machine.
 */

import Link from 'next/link';
import { motion } from 'motion/react';
import { EASE_APPLE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { ComposerDraftDiagram } from '@/components/marketing/diagrams';
import {
  SURFACE_LINKS,
  TEAM_LINKS,
  FEATURES_ALSO_LINKS,
  TEAMS_ALSO_LINKS,
  type MarketingLeafLink,
  type MarketingPlainLink,
} from './marketing-nav-links';

/** Small-caps column label — same vocabulary as SECTION_LABEL but the
 *  letter-spacing is tightened to the brief's 0.18em (vs ~0.1em). The
 *  panel's columns benefit from the extra space because the labels read
 *  as the header of a contents page, not as in-line metadata. */
const COLUMN_LABEL =
  'text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium';

interface LeafLinkRowProps {
  link: MarketingLeafLink;
  onNavigate?: () => void;
}

/** Single leaf row inside a column: icon + label on top, description below.
 *  Hover treatment matches the dashboard sidebar vocabulary
 *  (`hover:bg-foreground/[0.04]`) so a realtor moving from the marketing
 *  site into the product feels the same hairlines and the same tactile
 *  hover. No colour shift on hover — the label is already foreground. */
function LeafLinkRow({ link, onNavigate }: LeafLinkRowProps) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={cn(
        'group flex flex-col gap-1 rounded-md px-3 py-2.5',
        'hover:bg-foreground/[0.04] transition-colors duration-150',
        'focus-visible:outline-none focus-visible:bg-foreground/[0.04]',
      )}
    >
      <span className="flex items-center gap-2">
        <Icon
          size={14}
          strokeWidth={1.75}
          className="text-foreground/70 group-hover:text-foreground transition-colors duration-150 flex-shrink-0"
        />
        <span className="text-sm font-medium text-foreground">{link.label}</span>
      </span>
      <span className="text-xs text-muted-foreground leading-snug pl-[22px]">
        {link.description}
      </span>
    </Link>
  );
}

interface PlainLinkRowProps {
  link: MarketingPlainLink;
  onNavigate?: () => void;
}

/** "Also" column row — no icon, no description. Plain `text-sm` link with
 *  the same hover background as the leaf rows so the column reads as one
 *  surface, not two vocabularies. */
function PlainLinkRow({ link, onNavigate }: PlainLinkRowProps) {
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center rounded-md px-3 py-2.5 text-sm text-foreground/85',
        'hover:bg-foreground/[0.04] hover:text-foreground',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:bg-foreground/[0.04]',
      )}
    >
      {link.label}
    </Link>
  );
}

interface MarketingNavPanelProps {
  /** Which panel to render. */
  variant: 'features' | 'teams';
  /** Click handler propagated to leaf rows so the panel can dismiss after
   *  a link is followed. */
  onNavigate?: () => void;
  /** Mouse enter handler — used by the parent to cancel the close timer
   *  when the cursor enters the panel area. */
  onMouseEnter?: () => void;
  /** Mouse leave handler — used by the parent to re-arm the close timer
   *  when the cursor leaves the panel area. */
  onMouseLeave?: () => void;
}

/** The animated panel itself. The motion lives here so the parent only
 *  toggles a boolean — the panel handles its own entrance + exit. */
export function MarketingNavPanel({
  variant,
  onNavigate,
  onMouseEnter,
  onMouseLeave,
}: MarketingNavPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: EASE_APPLE }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'absolute left-0 right-0 top-full',
        'bg-background border-b border-border/60',
      )}
    >
      <div className="mx-auto max-w-7xl px-8 py-10">
        {variant === 'features' ? (
          <FeaturesPanelContent onNavigate={onNavigate} />
        ) : (
          <TeamsPanelContent onNavigate={onNavigate} />
        )}
      </div>
    </motion.div>
  );
}

/* ─── Panel content shapes ───────────────────────────────────────────── */

/** A single labeled column of leaf links — surfaces, teams, etc. The
 *  COLUMN_LABEL sits above the list; the list itself is offset by -mx-3
 *  so the row hover background lines up with the column gutter rather
 *  than slamming into the next column. */
function LeafColumn({
  label,
  links,
  onNavigate,
}: {
  /** Pass an empty string to render an invisible spacer label so the
   *  column stays vertically aligned with its labeled sibling. */
  label: string;
  links: MarketingLeafLink[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-4">
      {label ? (
        <p className={COLUMN_LABEL}>{label}</p>
      ) : (
        <p aria-hidden className={cn(COLUMN_LABEL, 'invisible')}>&nbsp;</p>
      )}
      <div className="space-y-0 -mx-3">
        {links.map((link) => (
          <LeafLinkRow key={link.href} link={link} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

/** "Also" column — plain link rows under a column label. */
function PlainColumn({
  label,
  links,
  onNavigate,
}: {
  label: string;
  links: MarketingPlainLink[];
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className={COLUMN_LABEL}>{label}</p>
      <div className="space-y-0 -mx-3">
        {links.map((link) => (
          <PlainLinkRow key={link.href} link={link} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

/** The media column — no label above so the visual reads as the panel's
 *  emotional anchor, not as one more list of stuff. A live
 *  `<ComposerDraftDiagram>` (Chippi drafting a reply) carries the one
 *  motion beat in the nav. Wrapped in `space-y-4` with an empty header
 *  spacer so vertical alignment with the labeled columns is honest (label
 *  heights vary in dark mode). The diagram honors reduced-motion and fills
 *  its shell at `aspect="tall"`. */
function MediaColumn() {
  return (
    <div className="space-y-4">
      <div aria-hidden className={cn(COLUMN_LABEL, 'invisible')}>&nbsp;</div>
      <ComposerDraftDiagram aspect="tall" />
    </div>
  );
}

function FeaturesPanelContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="grid grid-cols-4 gap-8">
      <LeafColumn label="By surface" links={SURFACE_LINKS} onNavigate={onNavigate} />
      <LeafColumn label="For teams" links={TEAM_LINKS} onNavigate={onNavigate} />
      <PlainColumn label="Also" links={FEATURES_ALSO_LINKS} onNavigate={onNavigate} />
      <MediaColumn />
    </div>
  );
}

function TeamsPanelContent({ onNavigate }: { onNavigate?: () => void }) {
  // The Teams panel splits 6 team links into two equal visual columns so
  // the layout stays 4-up (parallel with the Features panel). 6 stacked
  // in a single column would feel lopsided against the 3-row "Also" and
  // pull the panel taller than it needs to be.
  const teamsLeft = TEAM_LINKS.slice(0, 3);
  const teamsRight = TEAM_LINKS.slice(3);

  return (
    <div className="grid grid-cols-4 gap-8">
      <LeafColumn label="For teams" links={teamsLeft} onNavigate={onNavigate} />
      <LeafColumn label="" links={teamsRight} onNavigate={onNavigate} />
      <PlainColumn label="Also" links={TEAMS_ALSO_LINKS} onNavigate={onNavigate} />
      <MediaColumn />
    </div>
  );
}
