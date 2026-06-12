/**
 * Frame primitives for the calm site, the pieces that make product imagery
 * read as enterprise-grade instead of vibecoded.
 *
 * - PanelFrame: a clean hairline frame with a tasteful soft shadow, wrapping a
 *   screenshot or a live mockup. No faux browser chrome, the dots-and-URL-bar
 *   window costume was cut deliberately; the work inside the frame is the
 *   show. Shadows are sanctioned in the marketing layer (STYLESHEET.md
 *   §Shadows), the product stays flat; the pitch is allowed depth.
 * - ImagePlaceholder: a labeled, clearly-intentional slot for a screenshot the
 *   owner drops in later. It says exactly what goes there and at what ratio, so
 *   it never reads as a broken image.
 * - GridBackdrop: a faint dot-grid texture, edge-masked, for section depth.
 */

import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PanelFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-marketing-2xl border border-border/70 bg-background shadow-2xl shadow-foreground/[0.08] ring-1 ring-inset ring-white/5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ImagePlaceholder({
  label,
  sublabel,
  ratio = 'aspect-[16/10]',
  className,
}: {
  label: string;
  sublabel?: string;
  ratio?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden',
        ratio,
        className,
      )}
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
        backgroundSize: '22px 22px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--brand-subtle),transparent_70%)] opacity-60" />
      <div className="relative z-10 flex flex-col items-center px-6 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground backdrop-blur-sm">
          <ImageIcon className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-medium text-foreground/80">{label}</p>
        {sublabel ? (
          <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            {sublabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Faint dot-grid texture for section depth. Absolutely positioned; the parent
 *  must be `relative`. Edge-masked so it never reads as a hard pattern. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
        backgroundSize: '26px 26px',
        maskImage:
          'radial-gradient(ellipse 70% 60% at 50% 35%, black, transparent 75%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 70% 60% at 50% 35%, black, transparent 75%)',
        opacity: 0.5,
      }}
    />
  );
}
