'use client';

/**
 * IntakeChatShell — bespoke layout for the public intake chat surface.
 *
 * The generic PublicPageShell carries form-page furniture (page title,
 * intro paragraph, trust line, "Applying with X" band, footer columns)
 * that competes with the chat for attention. The intake chat doesn't
 * need any of it — the realtor's presence is the brand, the chat is
 * the content, the footer is small print.
 *
 * What this renders:
 *   - Top: realtor photo + name + optional secondary line (brokerage).
 *     ONE appearance. No business-name repetition. No "Applying with"
 *     duplicate band. A hairline divider closes the header.
 *   - Middle: a max-w-2xl column that the chat fills.
 *   - Bottom: an almost-invisible footer (Terms / Privacy / "Powered by
 *     Chippi"). Stays out of the way unless the lead looks for it.
 *
 * The shell makes no decisions about chat behaviour — children render
 * whatever the chat state machine produces.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { BrandLogo } from '@/components/brand-logo';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { safeHref, cn } from '@/lib/utils';

export interface IntakeChatShellProps {
  agentName: string;
  agentPhoto?: string | null;
  /** Optional secondary line under the agent's name. Use the brokerage
   *  or business name only when it adds context — duplicating the agent
   *  name (or the slug) here is the failure mode this shell is fixing. */
  secondaryLabel?: string | null;
  accentColor?: string;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;
  hidePoweredBy?: boolean;
  footerLinks?: { label: string; url: string }[];
  /** Realtor/brokerage-supplied trust signals. Chippi never injects
   *  legal copy — the slots are optional and the block disappears
   *  entirely when none are provided. */
  licenseNumber?: string | null;
  fairHousingNotice?: string | null;
  showEqualHousingMark?: boolean;
  children: ReactNode;
}

/** Standard Equal Housing Opportunity mark — house silhouette with an
 *  equals sign. Rendered as inline SVG so it inherits text color and
 *  scales cleanly at ~14px. Pure presentation, no remote assets. */
function EqualHousingMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-label="Equal Housing Opportunity"
      role="img"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* House silhouette */}
      <path d="M3 11 L12 3 L21 11 V21 H3 Z" />
      {/* Equals sign inside */}
      <line x1="8" y1="13.5" x2="16" y2="13.5" />
      <line x1="8" y1="16.5" x2="16" y2="16.5" />
    </svg>
  );
}

/** First two initials from a name. Falls back to a single dot when empty. */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function IntakeChatShell({
  agentName,
  agentPhoto,
  secondaryLabel,
  accentColor,
  privacyPolicyUrl,
  termsUrl,
  hidePoweredBy,
  footerLinks,
  licenseNumber,
  fairHousingNotice,
  showEqualHousingMark,
  children,
}: IntakeChatShellProps) {
  // The trust block is entirely optional. If the realtor hasn't supplied
  // any of these three, render nothing — no hairline, no empty space.
  const trustedLicense = licenseNumber?.trim() || '';
  const trustedNotice = fairHousingNotice?.trim() || '';
  const hasTrustBlock = Boolean(
    trustedLicense || trustedNotice || showEqualHousingMark,
  );
  // If the secondary label is just the agent name again (the common
  // "businessName === agentName" case), drop it. Repetition is the
  // exact thing this shell exists to prevent.
  const showSecondary =
    secondaryLabel && secondaryLabel.trim().length > 0 && secondaryLabel !== agentName;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ── Header — agent presence, ONE appearance ──────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className="w-full pt-10 sm:pt-14"
      >
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          <div className="flex items-center gap-4">
            {agentPhoto ? (
              // Real photo wins every time it's available. The fallback
              // initials only fire when the realtor hasn't uploaded one.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={agentPhoto}
                alt={agentName}
                className="w-14 h-14 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <span
                aria-hidden
                className="w-14 h-14 rounded-full flex-shrink-0 inline-flex items-center justify-center text-lg font-semibold text-white select-none"
                style={{ backgroundColor: accentColor || '#0c0c0d' }}
              >
                {deriveInitials(agentName)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-semibold text-foreground leading-tight truncate">
                {agentName}
              </p>
              {showSecondary && (
                <p className="mt-0.5 text-[13px] text-muted-foreground truncate">
                  {secondaryLabel}
                </p>
              )}
            </div>
          </div>
          <div className="mt-8 h-px bg-border/60" />
        </div>
      </motion.header>

      {/* ── Main — the chat fills this column ────────────────────────── */}
      <main className="flex-1 w-full">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 py-6 sm:py-8 pb-16">
          {children}
        </div>
      </main>

      {/* ── Footer — small print, easy to ignore ─────────────────────── */}
      <footer className="w-full pb-8 pt-2">
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          {/* Trust signals — only renders when the realtor supplies content.
              Sits above the Terms/Privacy/PoweredBy row, separated by a
              hairline. Paper-flat: text + rule, no chrome. */}
          {hasTrustBlock && (
            <div className="mb-3 pb-3 border-b border-border/40 text-[11px] text-muted-foreground/80 space-y-1.5">
              {showEqualHousingMark && (
                <div>
                  <EqualHousingMark className="h-3.5 w-3.5 text-muted-foreground/70" />
                </div>
              )}
              {trustedLicense && <div>{trustedLicense}</div>}
              {trustedNotice && (
                <div className="whitespace-pre-line">{trustedNotice}</div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-4 text-[11px] text-muted-foreground/70">
            <div className="flex items-center gap-4">
              {termsUrl && (
                <Link
                  href={safeHref(termsUrl)}
                  className="hover:text-foreground transition-colors"
                >
                  Terms
                </Link>
              )}
              {privacyPolicyUrl && (
                <Link
                  href={safeHref(privacyPolicyUrl)}
                  className="hover:text-foreground transition-colors"
                >
                  Privacy
                </Link>
              )}
              {(footerLinks ?? []).map((l) => (
                <Link
                  key={l.url}
                  href={safeHref(l.url)}
                  className="hover:text-foreground transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            {!hidePoweredBy && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-muted-foreground/60',
                )}
              >
                Powered by <BrandLogo className="h-3 opacity-70" />
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
