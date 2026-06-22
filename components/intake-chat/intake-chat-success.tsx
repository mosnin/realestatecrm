'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { CheckCircle2, CalendarCheck, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pickContrastColor } from '@/lib/color';
import { EASE_OUT, DURATION_BASE } from '@/lib/motion';
import { blurRise, INTAKE_EASE } from './intake-motion';

export interface IntakeChatSuccessProps {
  businessName: string;
  /** The applicant's first name, parsed from their submission. When present
   *  the headline addresses them directly ("Thanks Alex —"). */
  firstName?: string | null;
  /** The actual person they're applying with — used in the next-step line
   *  ("Jane will reach out within 24 hours."). Falls back to businessName. */
  realtorName?: string | null;
  agentPhoto?: string | null;
  applicationRef?: string | null;
  thankYouTitle?: string | null;
  thankYouMessage?: string | null;
  accentColor?: string;
  /** Primary next-step CTA — links into the tour booking flow (/book/[slug]). */
  bookHref?: string | null;
  /** Link into the applicant's status portal (/apply/[slug]/status?ref=…). */
  statusHref?: string | null;
  /** When set, the success card renders a quiet "See {businessName}'s page"
   *  link out to the public profile. */
  profileHref?: string | null;
}

export function IntakeChatSuccess({
  businessName,
  firstName,
  realtorName,
  applicationRef,
  thankYouTitle,
  thankYouMessage,
  accentColor = '#ff964f',
  bookHref,
  statusHref,
  profileHref,
}: IntakeChatSuccessProps) {
  const who = (realtorName && realtorName.trim()) || businessName;
  const cleanFirst = firstName?.trim() || '';

  // Treat whitespace-only realtor customization as empty. A realtor who saved a
  // blank thank-you title/message previously produced a confirmation card with
  // an empty headline + empty body — which reads as "completely blank, no
  // thank-you" even though the card technically rendered. Trimming here means
  // the personalized fallback ALWAYS shows, so success is never silent.
  const customTitle = thankYouTitle?.trim() || '';
  const customMessage = thankYouMessage?.trim() || '';

  // Headline: realtor customization wins; otherwise a warm, personal thank-you
  // that names the applicant when we know it.
  const headline =
    customTitle || (cleanFirst ? `Thanks, ${cleanFirst}.` : 'Application received.');

  // Subtext: realtor customization wins; otherwise the explicit next-step
  // promise the QA spec asks for ("… will reach out within 24 hours.").
  const subtext = customMessage || `${who} will reach out within 24 hours.`;

  const ctaTextColor = pickContrastColor(accentColor);
  const reduce = useReducedMotion();

  return (
    // The finish mirrors the onboarding closing reveal (OnboardingReady):
    // the elements blur-rise in on the shared expo-out curve, the serif
    // headline lands as the focal line, then the next-step actions settle
    // below. Calm, staged, the same product family as onboarding's payoff.
    <motion.div
      {...blurRise(reduce, 12, 8)}
      transition={{ duration: 0.7, ease: INTAKE_EASE }}
      className={cn(
        'flex flex-col items-center text-center',
        'px-6 py-10 space-y-5',
        'my-auto',
      )}
    >
      {/* Animated checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.18, type: 'spring', stiffness: 200, damping: 15 }}
        className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center"
        aria-hidden="true"
      >
        <CheckCircle2 size={28} className="text-emerald-600 dark:text-emerald-400" />
      </motion.div>

      {/* Headline + subtext — blur-rises a beat after the mark, the serif
          line as the payoff (onboarding final-line vocabulary). */}
      <motion.div
        {...blurRise(reduce, 10, 8)}
        transition={{ delay: 0.28, duration: 0.6, ease: INTAKE_EASE }}
        className="space-y-1.5"
      >
        <h2
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {headline}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">{subtext}</p>
      </motion.div>

      {/* Application ref — 6 chars uppercase. A 64-char hex dump means nothing
          to an applicant; a short code is something they can quote on a phone
          call if the realtor asks for it. */}
      {applicationRef && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: DURATION_BASE }}
          className="text-[11px] tabular-nums text-muted-foreground/80"
        >
          Reference {applicationRef.replace(/-/g, '').slice(0, 6).toUpperCase()}
        </motion.p>
      )}

      {/* Next steps — the applicant has somewhere concrete to go. Primary CTA
          books a tour (the natural next action); below it a quiet link into
          the status portal so they can track the application. Neither
          dead-ends the flow. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: DURATION_BASE }}
        className="w-full max-w-xs space-y-3 pt-1"
      >
        {bookHref && (
          <Link
            href={bookHref}
            style={{ backgroundColor: accentColor, color: ctaTextColor }}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold transition-transform duration-150 active:scale-[0.99]"
          >
            <CalendarCheck size={16} aria-hidden />
            Book a tour
            <ArrowRight
              size={15}
              aria-hidden
              className="transition-transform duration-150 group-hover:translate-x-0.5"
            />
          </Link>
        )}

        {statusHref && (
          <Link
            href={statusHref}
            className="block text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground"
          >
            Check your status
          </Link>
        )}

        {profileHref && (
          <Link
            href={profileHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            See {businessName}&apos;s page
            <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </motion.div>
    </motion.div>
  );
}
