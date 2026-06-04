'use client';

/**
 * `<FilesDiagram />` — a Drive-style file browser, in here.
 *
 * One beat: the file rows settle in, then a Chippi badge lands on the top
 * document — Chippi filed the signed contract against the right deal without
 * being asked. Paper-flat, hairline-divided, real product vocabulary.
 *
 * Motion contract: rows reveal in sequence, the "Filed by Chippi" badge
 * arrives last, hold, fade out, restart. Reduced motion lands the end state.
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { FileText, Image as ImageIcon, FileSpreadsheet, Folder } from 'lucide-react';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  DiagramChippiBadge,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface FilesDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

const FILES = [
  { name: '415 Lexington signed contract.pdf', meta: 'PDF · 2m ago', icon: FileText },
  { name: '88 Pine listing photos', meta: '24 images · 1h ago', icon: ImageIcon },
  { name: 'Commission statement, Q2', meta: 'Sheet · yesterday', icon: FileSpreadsheet },
  { name: 'Chen buyer documents', meta: 'Folder · 6 files', icon: Folder },
];

const ROW_INTERVAL = 220;
const BADGE_DELAY = 360;
const HOLD = 1500;
const PAUSE = 700;

export function FilesDiagram({ aspect = 'video', className }: FilesDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <FilesContent />
    </ChippiDiagramShell>
  );
}

function FilesContent() {
  const { reduced } = useDiagramMotion();
  const [phase, setPhase] = useState<number>(reduced ? 4 : -1);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function run() {
      FILES.forEach((_, i) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) setPhase(i);
          }, i * ROW_INTERVAL + 300),
        );
      });
      timers.push(
        setTimeout(() => {
          if (!cancelled) setPhase(4);
        }, FILES.length * ROW_INTERVAL + BADGE_DELAY + 300),
      );
      timers.push(
        setTimeout(
          () => {
            if (cancelled) return;
            setPhase(-1);
            timers.push(setTimeout(run, PAUSE));
          },
          FILES.length * ROW_INTERVAL + BADGE_DELAY + HOLD + 300,
        ),
      );
    }

    run();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 rounded-xl border border-border/70 bg-background overflow-hidden flex flex-col">
        <div className="shrink-0 px-4 sm:px-5 pt-3.5 pb-3 border-b border-border/60 flex items-center justify-between">
          <p
            className="text-[14px] sm:text-[15px] tracking-tight text-foreground leading-snug"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            Files
          </p>
          <span className="text-[11px] text-muted-foreground">All documents</span>
        </div>

        <div className="flex-1 min-h-0 divide-y divide-border/60">
          {FILES.map((file, i) => {
            const visible = phase >= i;
            const Icon = file.icon;
            return (
              <motion.div
                key={i}
                className="px-4 sm:px-5 py-2.5 flex items-center gap-3"
                initial={false}
                animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                transition={{ duration: 0.22, ease: EASE_APPLE }}
              >
                <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground">
                  <Icon size={14} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] sm:text-[13px] text-foreground truncate">
                      {file.name}
                    </span>
                    {i === 0 && (
                      <motion.span
                        initial={false}
                        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                        transition={{ duration: 0.22, ease: EASE_APPLE }}
                      >
                        <DiagramChippiBadge label="Filed by Chippi" />
                      </motion.span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{file.meta}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
