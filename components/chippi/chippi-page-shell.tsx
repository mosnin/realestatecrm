/**
 * ChippiPageShell — the single canonical container for every Chippi sub-route.
 *
 * Same product = same identity below the page chrome. Every /chippi/* leaf
 * page (today, drafts, activity, memory, approvals, …) wraps its content in
 * this shell so containers, headers, vertical rhythm, and muted-greeting
 * pattern stay identical. No surprise hero text, no drifted spacing.
 *
 * Header pattern follows STYLESHEET.md "status-sentence" rule:
 *   muted greeting → serif H1 title → muted subtitle.
 *
 * If a page needs a section heading inside the body, use SECTION_LABEL from
 * lib/typography.ts — never hand-roll text classes.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { H1, TITLE_FONT, BODY_MUTED, SECTION_RHYTHM } from '@/lib/typography';

interface ChippiPageShellProps {
  /** Small muted line above the title, e.g. "Drafts." or "Memory." */
  greeting: string;
  /** Page-level H1 — serif Times via TITLE_FONT. */
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
        <header className="space-y-1.5">
          <p className={BODY_MUTED}>{greeting}</p>
          <h1 className={H1} style={TITLE_FONT}>
            {title}
          </h1>
          <p className={BODY_MUTED}>{subtitle}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
