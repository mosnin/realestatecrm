/**
 * ChippiPageShell — the single canonical container for every Chippi sub-route.
 *
 * Same product = same identity below the page chrome. Every /chippi/* leaf
 * page (brief, drafts, activity, memory, approvals, routines, integrations)
 * wraps its content in this shell so containers, headers, vertical rhythm,
 * and muted-greeting pattern stay identical. No surprise hero text, no
 * drifted spacing.
 *
 * Header treatment per the Jobs-lens audit: serif Times h1 + status
 * sentence. The chat HOME is chat-mode (own treatment in chippi-workspace.tsx).
 * The sub-pages — brief, drafts, activity, memory — are reading-and-deciding
 * mode. Reading-mode pages get the serif. That's how Chippi pages feel like
 * one product.
 *
 * `title` and `subtitle` are optional. When the page's content carries its
 * OWN dynamic title (the brief's morning sentence, for example), omit the
 * shell title so two serif h1s don't stack. The greeting line ("Today.")
 * still orients without competing.
 *
 * If a page needs a section heading inside the body, use SECTION_LABEL
 * from lib/typography.ts — never hand-roll text classes.
 *
 * `variant` — 'realtor' (default) or 'broker'. Does not change the shell's
 * visual structure today, but is forwarded so downstream consumers and the
 * broker-home renderer can pass `variant="broker"` when composing sub-pages
 * inside the broker surface. The ChippiWorkspace nav dropdown (Brief /
 * Drafts / History) reads the same prop to resolve broker-correct routes.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, H1, TITLE_FONT } from '@/lib/typography';

interface ChippiPageShellProps {
  /** Small muted line above the title, e.g. "Drafts." or "Memory." */
  greeting: string;
  /** Page title — serif Times. Optional: omit when the content owns the
   *  page's h1 (the brief's morning sentence is its title). */
  title?: string;
  /** Status-sentence subtitle. Optional: pair with title. */
  subtitle?: string;
  children: ReactNode;
  /**
   * Which Chippi surface this shell is embedded in.
   *
   * - `realtor` (default) — /s/[slug]/chippi/* sub-pages.
   * - `broker` — /broker/* sub-pages.
   *
   * The shell's visual output is identical for both variants today. The prop
   * is pinned on the interface so the broker-home renderer (and any future
   * broker-specific sub-page) can declare intent clearly. The ChippiWorkspace
   * control-cluster dropdown uses the same prop to resolve Brief / Drafts /
   * History destinations to the correct route family.
   */
  variant?: 'realtor' | 'broker';
  /**
   * Soft muted wash behind the page content so flat white cards float
   * (the dashboard-card language). Opt-in — card-heavy pages (the brief)
   * set it; reading pages keep the plain canvas.
   */
  washed?: boolean;
}

export function ChippiPageShell({
  greeting,
  title,
  subtitle,
  children,
  variant = 'realtor',
  washed = false,
}: ChippiPageShellProps) {
  void variant; // consumed by callers for route resolution — no visual branch today
  return (
    <div className={cn('h-full overflow-y-auto', washed && 'bg-surface/55 dark:bg-transparent')}>
      {/* Match the Automations page frame: the wider max-w-5xl reading column
          and the space-y-8 section rhythm, so every Chippi non-chat sub-page
          (brief, inbox, activity, …) sits in the same premium People/Deals
          surface rather than a narrow chat-reading column. */}
      <div className="w-full max-w-5xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24 space-y-9">
        <header className="space-y-1.5">
          <p className={BODY_MUTED}>{greeting}</p>
          {title && (
            <h1 className={H1} style={TITLE_FONT}>
              {title}
            </h1>
          )}
          {subtitle && <p className={BODY_MUTED}>{subtitle}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}
