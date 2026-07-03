'use client';

import { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';

interface TourFeedbackBadgeProps {
  tourId: string;
  slug: string;
  status: string;
}

export function TourFeedbackBadge({ tourId, slug, status }: TourFeedbackBadgeProps) {
  const reduced = useReducedMotion();
  const [feedback, setFeedback] = useState<{ rating: number; comment: string | null } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== 'completed') return;
    fetch(`/api/tours/feedback?slug=${slug}&tourId=${tourId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.rating) setFeedback(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [tourId, slug, status]);

  if (status !== 'completed' || !loaded) return null;
  if (!feedback) return null;

  return (
    <div className="flex items-center gap-0.5" title={feedback.comment || `${feedback.rating}/5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < feedback.rating;
        return (
          <motion.span
            key={i}
            initial={reduced ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduced ? undefined : { duration: 0.25, ease: EASE_APPLE, delay: i * 0.04 }}
            className="flex"
          >
            <Star
              size={10}
              className={cn(filled ? 'text-foreground fill-foreground' : 'text-muted-foreground/20')}
            />
          </motion.span>
        );
      })}
    </div>
  );
}
