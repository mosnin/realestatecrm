'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { countLabel } from '@/lib/formatting';
import {
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion';

interface TourPrepData {
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  propertyAddress: string | null;
  tourDate: string;
  tourTime: string;
  duration: number;
  contactHighlights: string[];
  scoreInfo: { score: number | null; label: string | null; summary: string | null } | null;
  applicationHighlights: string[];
  talkingPoints: string[];
  previousTours: number;
  warnings: string[];
}

interface TourPrepCardProps {
  tourId: string;
}

export function TourPrepCard({ tourId }: TourPrepCardProps) {
  const reduced = useReducedMotion();
  const [prep, setPrep] = useState<TourPrepData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadPrep() {
    if (loaded) { setExpanded(!expanded); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/prep`);
      if (res.ok) {
        setPrep(await res.json());
        setLoaded(true);
        setExpanded(true);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={loadPrep}
        disabled={loading}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border border-border bg-muted/40 text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <MessageCircle size={12} />}
        Prep
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      <AnimatePresence>
      {expanded && prep && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
          style={{ transformOrigin: 'top right' }}
          className="absolute right-0 top-full mt-2 z-30 w-80 sm:w-96 rounded-xl border border-border/70 bg-card shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              Tour Prep — {prep.guestName}
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
              <span>{prep.tourDate}</span>
              <span>{prep.tourTime} ({prep.duration}min)</span>
            </div>
          </div>

          <div className="p-4 space-y-3 max-h-80 overflow-y-auto">
            {/* Guest info */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Guest</p>
              <div className="space-y-0.5 text-xs">
                <p>{prep.guestName}</p>
                <p>{prep.guestEmail}</p>
                {prep.guestPhone && <p>{prep.guestPhone}</p>}
                {prep.propertyAddress && <p>{prep.propertyAddress}</p>}
                {prep.previousTours > 0 && <p className="text-[10px] text-muted-foreground">{countLabel(prep.previousTours, 'previous tour')}</p>}
              </div>
            </div>

            {/* Score */}
            {prep.scoreInfo && prep.scoreInfo.score != null && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Lead Score</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tabular-nums">{Math.round(prep.scoreInfo.score)}</span>
                  <span className={cn(
                    'text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full',
                    'bg-muted text-muted-foreground'
                  )}>
                    {prep.scoreInfo.label}
                  </span>
                </div>
                {prep.scoreInfo.summary && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{prep.scoreInfo.summary}</p>
                )}
              </div>
            )}

            {/* Contact highlights */}
            {prep.contactHighlights.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Contact profile</p>
                <div className="space-y-0.5">
                  {prep.contactHighlights.map((h, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{h}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Application highlights */}
            {prep.applicationHighlights.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Application</p>
                <div className="space-y-0.5">
                  {prep.applicationHighlights.map((h, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{h}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Warnings */}
            {prep.warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500/60">Risk Flags</p>
                <div className="space-y-0.5">
                  {prep.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">
                      {w}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Talking points */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Talking Points</p>
              <div className="space-y-1">
                {prep.talkingPoints.map((t, i) => (
                  <p key={i} className="text-xs text-foreground">
                    {t}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
