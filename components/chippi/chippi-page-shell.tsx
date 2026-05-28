/**
 * ChippiPageShell — the single canonical container for every Chippi sub-route.
 *
 * Same product = same identity below the page chrome. Every /chippi/* leaf
 * page (today, drafts, activity, memory, approvals, …) wraps its content in
 * this shell so containers, headers, vertical rhythm, and muted-greeting
 * pattern stay identical. No surprise hero text, no drifted spacing.
 *
 * Header is deliberately calm — Chippi pages are conversational surfaces
 * where the CONTENT is the focal moment (the morning narration, the draft
 * card, the activity entry). The page title is orientation, not a hero:
 * a single sans-serif line at text-base font-semibold, no serif Times.
 * Other realtor surfaces (properties, contacts) keep the serif H1 because
 * those pages are reading registers — but Chippi is a chat-mode product.
 *
 * If a page needs a section heading inside the body, use SECTION_LABEL from
 * lib/typography.ts — never hand-roll text classes.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, SECTION_RHYTHM } from '@/lib/typography';

interface ChippiPageShellProps {
  /** Small muted line above the title, e.g. "Drafts." or "Memory." */
  greeting: string;
  /** Page title — sans-serif, body-sized. Orientation, not a hero. */
  title: string;
  /** Status-sentence subtitle. One line, plain prose. */
  subtitle: string;
  children: ReactNode;
}

export function ChippiPageShell({
  greeting,
  title,
  subtitle,
  children,
}: ChippiPageShellProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          'w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24',
          SECTION_RHYTHM,
        )}
      >
        <header className="space-y-1">
          <p className={BODY_MUTED}>{greeting}</p>
          <h1 className="text-base font-semibold text-foreground">
            {title}
          </h1>
          <p className={BODY_MUTED}>{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
