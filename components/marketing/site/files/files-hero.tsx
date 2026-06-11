'use client';

/**
 * FilesHero — the /files opener, adapted from the source two-column hero.
 * Recolored to the calm system (no blue/purple/green shapes — washed brand +
 * muted), and the people-photo collage swapped for mock file tiles (a
 * contract, a listing photo, a CMA) so nothing 404s. framer-motion entrance,
 * reduced-motion aware via variants that collapse to a plain fade.
 */

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, FileText, Image as ImageIcon, FileSpreadsheet, FolderCheck, Search, ShieldCheck } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';
import { TITLE_FONT } from '@/lib/typography';

const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.12 } } };
const item = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } } };

const STATS = [
  { Icon: FolderCheck, value: 'Every doc', label: 'auto-filed to the deal' },
  { Icon: Search, value: 'One search', label: 'across every file' },
  { Icon: ShieldCheck, value: 'Zero', label: 'lost paperwork' },
];

function FileTile({
  Icon,
  name,
  meta,
  tone,
  className,
}: {
  Icon: React.ElementType;
  name: string;
  meta: string;
  tone: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border/70 bg-card p-2 shadow-2xl shadow-foreground/[0.10] ring-1 ring-inset ring-white/5 ${className ?? ''}`}>
      <div className={`flex h-28 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-9 w-9 text-foreground/70" />
      </div>
      <p className="mt-2 truncate px-1 text-xs font-medium text-foreground">{name}</p>
      <p className="truncate px-1 text-[11px] text-muted-foreground">{meta}</p>
    </div>
  );
}

export function FilesHero() {
  const reduce = useReducedMotion();
  const float = reduce
    ? {}
    : { animate: { y: [0, -8, 0] }, transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const } };

  return (
    <section className="relative w-full overflow-hidden border-b border-border/60 bg-background px-4 pt-32 pb-16 sm:px-6 sm:pt-36">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        {/* Left */}
        <motion.div variants={container} initial="hidden" animate="visible" className="text-center lg:text-left">
          <motion.p variants={item} className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Files
          </motion.p>
          <motion.h1 variants={item} className="mt-4 text-[2.5rem] leading-[1.05] tracking-tight text-foreground sm:text-[3.5rem]" style={TITLE_FONT}>
            Every file, one place.
          </motion.h1>
          <motion.p variants={item} className="mx-auto mt-5 max-w-md text-lg leading-relaxed text-muted-foreground lg:mx-0">
            Contracts, disclosures, listing photos, CMAs — Chippi files every document to
            the right deal automatically, so you find it in one search instead of five folders.
          </motion.p>
          <motion.div variants={item} className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
            >
              Watch demo
            </Link>
          </motion.div>
          <motion.div variants={item} className="mt-10 flex flex-wrap justify-center gap-8 lg:justify-start">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle text-brand">
                  <s.Icon className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <p className="text-base font-semibold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right — floating file tiles */}
        <div className="relative mx-auto h-[380px] w-full max-w-md sm:h-[440px]">
          <motion.div aria-hidden className="absolute left-1/4 top-2 h-16 w-16 rounded-full bg-brand-subtle" {...float} />
          <motion.div aria-hidden className="absolute bottom-6 right-1/4 h-12 w-12 rounded-lg bg-muted" {...float} />
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            className="absolute left-1/2 top-0 w-44 -translate-x-1/2"
          >
            <FileTile Icon={FileText} name="Listing agreement.pdf" meta="14 Oak St · signed" tone="bg-gradient-to-br from-brand-subtle to-muted/40" />
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.12 }}
            className="absolute right-0 top-1/3 w-40"
          >
            <FileTile Icon={ImageIcon} name="Front exterior.jpg" meta="220 Marina Blvd" tone="bg-gradient-to-br from-muted/60 to-brand-subtle" />
          </motion.div>
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.24 }}
            className="absolute bottom-0 left-0 w-40"
          >
            <FileTile Icon={FileSpreadsheet} name="CMA — 88 Pine.pdf" meta="Comp analysis" tone="bg-gradient-to-br from-muted/50 to-muted/20" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
