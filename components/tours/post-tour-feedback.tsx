'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countLabel } from '@/lib/formatting';
import { EASE_APPLE, EASE_OUT } from '@/lib/motion';
import { BODY_MUTED, PRIMARY_PILL, TITLE_FONT } from '@/lib/typography';

interface PostTourFeedbackProps {
  token: string;
  guestName: string;
  businessName: string;
}

/** Reactions keyed to the chosen rating — the line that confirms the tap
 *  landed and gives the moment a little warmth. */
const RATING_COPY: Record<number, string> = {
  1: 'Sorry it missed the mark.',
  2: 'Thanks for the honest read.',
  3: 'Good to know.',
  4: 'Glad it went well.',
  5: 'Wonderful, thank you.',
};

// Paper-flat field — identical family to the booking form's inputs so the
// applicant-facing surfaces read as one product.
const TEXTAREA_CLASS =
  'w-full bg-background border border-border/70 rounded-md px-3 py-2 text-base min-h-[72px] ' +
  'focus:border-foreground/30 focus:outline-none transition-colors placeholder:text-muted-foreground/70';

export function PostTourFeedback({ token, guestName, businessName }: PostTourFeedbackProps) {
  const reduce = useReducedMotion();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submitFeedback() {
    if (!rating) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/tours/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, comment: comment.trim() || null }),
      });
      if (res.ok || res.status === 409) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "That didn't go through. Usually temporary.");
      }
    } catch {
      setError("Couldn't reach the server. Usually temporary.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="rounded-xl border border-border/70 bg-background p-6 text-center"
      >
        <motion.div
          initial={reduce ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={reduce ? undefined : { delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[0.06]"
        >
          <Check size={18} className="text-foreground" />
        </motion.div>
        <h3 className="mt-4 text-2xl tracking-tight text-foreground" style={TITLE_FONT}>
          Thank you, {guestName.split(' ')[0] || guestName}.
        </h3>
        <p className={cn(BODY_MUTED, 'mx-auto mt-1.5 max-w-xs')}>
          Your note helps {businessName} get better with every tour.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-background p-6">
      <div className="text-center">
        <h3 className="text-2xl tracking-tight text-foreground" style={TITLE_FONT}>
          How was your tour?
        </h3>
        <p className={cn(BODY_MUTED, 'mt-1.5')}>A quick rating helps {businessName}.</p>
      </div>

      {/* Star rating — accessible radiogroup with spring micro-interaction. */}
      <div
        role="radiogroup"
        aria-label="Tour rating"
        className="mt-5 flex justify-center gap-1.5"
        onMouseLeave={() => setHoveredRating(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= (hoveredRating || rating);
          return (
            <motion.button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={countLabel(n, 'star')}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHoveredRating(n)}
              onFocus={() => setHoveredRating(n)}
              onBlur={() => setHoveredRating(0)}
              whileTap={reduce ? undefined : { scale: 0.85 }}
              className="rounded-full p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              <motion.span
                animate={reduce ? undefined : { scale: active ? 1.08 : 1 }}
                transition={{ duration: 0.18, ease: EASE_APPLE }}
                className="block"
              >
                <StarGlyph filled={active} />
              </motion.span>
            </motion.button>
          );
        })}
      </div>

      {/* Reaction line — reserves its own height so the layout doesn't jump
          when a rating is first chosen. */}
      <div className="mt-2 h-5 text-center">
        <AnimatePresence mode="wait">
          {rating > 0 && (
            <motion.p
              key={rating}
              initial={reduce ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="text-sm text-foreground"
            >
              {RATING_COPY[rating]}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Comment + submit reveal once a rating is picked — keeps the first
          ask to a single tap, then invites the optional detail. */}
      <AnimatePresence initial={false}>
        {rating > 0 && (
          <motion.div
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: EASE_APPLE }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-3">
              <textarea
                placeholder="Anything you'd like to add? (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className={cn(TEXTAREA_CLASS, 'resize-none')}
              />

              {error && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={submitFeedback}
                className={cn(PRIMARY_PILL, 'w-full justify-center disabled:opacity-60 disabled:cursor-not-allowed')}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Star glyph — foreground when filled, a quiet hairline outline when not.
 *  Drawn inline so the fill/stroke transition is a single element rather than
 *  two stacked lucide icons. */
function StarGlyph({ filled }: { filled: boolean }) {
  return (
    <svg
      width={30}
      height={30}
      viewBox="0 0 24 24"
      aria-hidden
      className={cn(
        'transition-colors duration-150',
        filled ? 'text-foreground' : 'text-muted-foreground/25',
      )}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      <path d="M12 2.5l2.93 5.94 6.57.96-4.75 4.63 1.12 6.54L12 18.02 6.13 21.11l1.12-6.54L2.5 9.94l6.57-.96L12 2.5z" />
    </svg>
  );
}
