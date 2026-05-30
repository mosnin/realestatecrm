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
 * sentence. The earlier shell used a small sans h1 on the theory that
 * "Chippi is a chat-mode product." That was wrong. The chat HOME is
 * chat-mode (it has its own treatment in chippi-workspace.tsx). The
 * sub-pages — brief, drafts, activity, memory — are reading-and-deciding
 * mode. Reading-mode pages get the serif. That's how Chippi pages feel
 * like one product.
 *
 * If a page needs a section heading inside the body, use SECTION_LABEL
 * from lib/typography.ts — never hand-roll text classes.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, H1, TITLE_FONT, SECTION_RHYTHM } from '@/lib/typography';

interface ChippiPageShellProps {
  /** Small muted line above the title, e.g. "Drafts." or "Memory." */
  greeting: string;
  /** Page title — serif Times, the same h1 vocabulary as every other
   *  reading-register surface in the product. */
  title: string;
  /** Status-sentence subtitle. One line, plain prose, Chippi voice. */
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
