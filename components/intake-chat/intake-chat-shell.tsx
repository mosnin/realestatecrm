'use client';

/**
 * IntakeChatShell — the immersive, full-screen surface the applicant lands on.
 *
 * This is NOT a card. The earlier design boxed the whole intake into a
 * ~540px panel marooned in the middle of an empty canvas — it read as a
 * small widget, not an experience. This shell instead fills the viewport
 * the way the realtor onboarding does (components/onboarding/onboarding-shell):
 * a brand-warm wash edge-to-edge, the realtor's identity as a calm mark at
 * the top, and a single focal column centered in the screen where one
 * question lives at a time. The applicant-facing intake and the realtor
 * onboarding are now visibly the same product.
 *
 * What this shell owns:
 *   - The full-bleed canvas + brand-warm wash (and an optional, softened
 *     cover-photo glow at the very top — brand imagery without ever putting
 *     text on a photo).
 *   - The realtor identity mark (avatar + serif business name), centered at
 *     the top of the focal column. Quiet and secondary — the *question* is
 *     the hero, not the letterhead.
 *   - A minimal footer (trust/legal + Powered-by), pinned to the bottom of
 *     the canvas, never competing with the conversation.
 *
 * What it does NOT own: the flow. `children` render the active question,
 * the progress, back-navigation, submission, and success — see IntakeChat.
 *
 * The public prop contract is unchanged from the previous shell so the
 * server page (app/apply/[slug]/page.tsx) needs no edits.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, BadgeCheck } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { brandOrange } from '@/lib/colors';
import { safeHref, cn } from '@/lib/utils';
import { TITLE_FONT } from '@/lib/typography';
import { blurRise, INTAKE_EASE } from './intake-motion';

export interface IntakeChatShellProps {
  /** The realtor's brand-facing name — the serif identity line. */
  businessName: string;
  /** The actual person's name. Secondary line, only when it differs. */
  agentName: string;
  /** Realtor face. Signed/resolved upstream; null → serif monogram. */
  agentPhoto?: string | null;
  /** Optional cover photo — becomes a softened brand glow at the top. */
  coverPhotoUrl?: string | null;
  /** Wordmark, substitutes for the typed business name when present. */
  logoUrl?: string | null;
  /** Drives the blue-check next to the business name. */
  isVerified?: boolean;
  /** When set, the identity mark links to the realtor's public page. */
  profileHref?: string | null;
  accentColor?: string;
  privacyPolicyUrl?: string | null;
  termsUrl?: string | null;
  hidePoweredBy?: boolean;
  footerLinks?: { label: string; url: string }[];
  /** Realtor/brokerage trust signals. Optional; block disappears when empty. */
  licenseNumber?: string | null;
  fairHousingNotice?: string | null;
  showEqualHousingMark?: boolean;
  children: ReactNode;
}

/** Equal Housing Opportunity mark — inherits text color, scales at ~14px. */
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
      <path d="M3 11 L12 3 L21 11 V21 H3 Z" />
      <line x1="8" y1="13.5" x2="16" y2="13.5" />
      <line x1="8" y1="16.5" x2="16" y2="16.5" />
    </svg>
  );
}

/** First two initials from a name; falls back to a dot. */
function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * The realtor identity mark — avatar + serif name, centered.
 *
 * Deliberately restrained: a 56px avatar and a single serif line. On the
 * old card this was a full bordered hero band; here it's the equivalent of
 * the onboarding brand mark — it establishes who you're applying with in a
 * glance and then yields the stage to the question.
 */
function RealtorIdentity({
  businessName,
  agentName,
  agentPhoto,
  logoUrl,
  isVerified,
  profileHref,
}: {
  businessName: string;
  agentName: string;
  agentPhoto?: string | null;
  logoUrl?: string | null;
  isVerified?: boolean;
  profileHref?: string | null;
}) {
  const initials = deriveInitials(businessName || agentName);
  const showSecondary =
    agentName && agentName.trim() && agentName.trim() !== businessName.trim();

  const identityName = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={businessName}
      loading="eager"
      decoding="async"
      className="mx-auto h-7 max-w-[200px] object-contain"
    />
  ) : (
    <span
      className="inline-flex items-center justify-center gap-1.5 text-lg sm:text-xl leading-tight tracking-tight text-foreground"
      style={TITLE_FONT}
    >
      {businessName}
      {isVerified && (
        <BadgeCheck
          size={15}
          aria-label="Verified"
          className="shrink-0 fill-sky-500 text-white dark:fill-sky-400"
        />
      )}
    </span>
  );

  return (
    <div className="flex flex-col items-center text-center">
      {agentPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agentPhoto}
          alt={agentName}
          className="h-14 w-14 rounded-full object-cover object-top ring-1 ring-border/50 shadow-sm"
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            'h-14 w-14 rounded-full inline-flex items-center justify-center',
            'bg-orange-50 text-orange-600 ring-1 ring-orange-200/60',
            'dark:bg-orange-500/15 dark:text-orange-400 dark:ring-orange-500/20',
            'text-xl leading-none select-none',
          )}
          style={TITLE_FONT}
        >
          {initials}
        </span>
      )}

      <div className="mt-3">
        {profileHref ? (
          <Link
            href={profileHref}
            className="inline-block transition-opacity hover:opacity-80"
            aria-label={`View ${businessName}'s page`}
          >
            {identityName}
          </Link>
        ) : (
          identityName
        )}
        {showSecondary && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">{agentName}</p>
        )}
      </div>
    </div>
  );
}

export function IntakeChatShell({
  businessName,
  agentName,
  agentPhoto,
  coverPhotoUrl,
  logoUrl,
  isVerified,
  profileHref,
  privacyPolicyUrl,
  termsUrl,
  hidePoweredBy,
  footerLinks,
  licenseNumber,
  fairHousingNotice,
  showEqualHousingMark,
  children,
}: IntakeChatShellProps) {
  const trustedLicense = licenseNumber?.trim() || '';
  const trustedNotice = fairHousingNotice?.trim() || '';
  const hasTrustBlock = Boolean(
    trustedLicense || trustedNotice || showEqualHousingMark,
  );

  const reduce = useReducedMotion();

  return (
    // Immersive canvas — the whole viewport, edge to edge. No card, no
    // border, no sticky chrome. The brand-warm wash is the same one the
    // onboarding rides on so this reads as the same product family.
    <div className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* Brand-warm wash — full bleed, fixed so it never scrolls. */}
      <div
        aria-hidden
        className={brandOrange(
          'LOGO',
          'pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-orange-50/70 via-background to-orange-50/50 dark:from-orange-500/[0.05] dark:via-background dark:to-orange-500/[0.03]',
        )}
      />

      {/* Optional cover-photo glow — a softened, blurred band at the very top
          that fades into the canvas. Brand imagery as ambient atmosphere; the
          conversation still sits on the clean canvas, never on the photo, so
          text contrast is never at the mercy of a realtor's upload. */}
      {coverPhotoUrl && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[42vh] overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to bottom, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, black, transparent)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverPhotoUrl}
            alt=""
            loading="eager"
            decoding="async"
            className="h-full w-full scale-125 object-cover opacity-25 blur-[64px] dark:opacity-20"
          />
          <div
            aria-hidden
            className={brandOrange(
              'LOGO',
              'absolute inset-0 bg-gradient-to-b from-orange-500/[0.05] to-transparent',
            )}
          />
        </div>
      )}

      {/* Ultra-subtle paper grain over the whole canvas. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.025] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)',
          backgroundSize: '26px 26px',
        }}
      />

      {/* Persistent escape hatch back to the realtor's public profile. Sits
          top-right so it never collides with the flow's own top-left Back
          (previous-question) affordance, and stays available on every step
          including success. */}
      {profileHref && (
        <Link
          href={profileHref}
          className="fixed right-4 top-4 z-30 inline-flex items-center gap-1 rounded-full bg-background/60 px-3 py-1.5 text-[13px] text-muted-foreground/80 backdrop-blur-sm transition-colors hover:bg-foreground/[0.05] hover:text-foreground sm:right-6 sm:top-6"
        >
          View profile
          <ArrowUpRight size={14} aria-hidden />
        </Link>
      )}

      {/* Focal column. A flex column the height of the viewport: the
          conversation is vertically centered (justify-center) so a short
          first screen sits in the optical middle of the page instead of
          pinned to the top above a void. When a question's answer area is
          tall the column simply grows and the page scrolls. */}
      <div className="relative z-10 flex min-h-dvh flex-col">
        <main className="flex flex-1 flex-col justify-center px-6 py-20 sm:py-24">
          <div className="mx-auto w-full max-w-xl">
            {/* Identity mark — blur-rises in on the onboarding arrival curve. */}
            <motion.div
              {...blurRise(reduce, 10, 8)}
              transition={{ duration: 0.7, ease: INTAKE_EASE }}
              className="mb-10 sm:mb-12"
            >
              <RealtorIdentity
                businessName={businessName}
                agentName={agentName}
                agentPhoto={agentPhoto}
                logoUrl={logoUrl}
                isVerified={isVerified}
                profileHref={profileHref}
              />
            </motion.div>

            {/* The flow — active question / progress / back / success. */}
            {children}
          </div>
        </main>

        {/* Minimal footer — trust + legal, pinned to the bottom of the
            canvas, centered, quiet. Renders nothing loud. */}
        <footer className="relative z-10 shrink-0 px-6 pb-7 pt-4">
          <div className="mx-auto w-full max-w-xl space-y-3 text-center">
            {hasTrustBlock && (
              <div className="space-y-1.5 text-[11px] text-muted-foreground/70">
                {showEqualHousingMark && (
                  <div className="flex justify-center">
                    <EqualHousingMark className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </div>
                )}
                {trustedLicense && <div>{trustedLicense}</div>}
                {trustedNotice && (
                  <div className="whitespace-pre-line">{trustedNotice}</div>
                )}
              </div>
            )}
            <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground/60">
              {termsUrl && (
                <Link
                  href={safeHref(termsUrl)}
                  className="transition-colors hover:text-foreground"
                >
                  Terms
                </Link>
              )}
              {privacyPolicyUrl && (
                <Link
                  href={safeHref(privacyPolicyUrl)}
                  className="transition-colors hover:text-foreground"
                >
                  Privacy
                </Link>
              )}
              {(footerLinks ?? []).map((l) => (
                <Link
                  key={l.url}
                  href={safeHref(l.url)}
                  className="transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
              {!hidePoweredBy && (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground/50">
                  Powered by <BrandLogo className="h-3 opacity-70" />
                </span>
              )}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
