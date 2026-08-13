'use client';

import { Check, CircleAlert, Image as ImageIcon, LoaderCircle } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';

export type ImageGenerationStatus =
  | 'queued'
  | 'generating'
  | 'refining'
  | 'complete'
  | 'error';

export interface ImageGenerationProps {
  children?: ReactNode;
  status?: ImageGenerationStatus;
  label?: string;
  prompt?: string;
  resolution?: string;
  aspectRatio?: CSSProperties['aspectRatio'];
  statusText?: string;
  className?: string;
}

const STATUS_TEXT: Record<ImageGenerationStatus, string> = {
  queued: 'Waiting to generate',
  generating: 'Generating image',
  refining: 'Loading preview',
  complete: 'Image ready',
  error: 'Generation failed',
};

/**
 * Chippi adaptation of BEUI Image Generation. It reserves the final media
 * geometry from the first tool event and only displays real generated media;
 * active states never fabricate a preview or timed refinement phase.
 */
export function ImageGeneration({
  children,
  status = 'generating',
  label,
  prompt,
  resolution,
  aspectRatio = '4 / 3',
  statusText,
  className,
}: ImageGenerationProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const active = status === 'queued' || status === 'generating' || status === 'refining';
  const resolvedStatus = statusText ?? STATUS_TEXT[status];
  const StatusIcon = status === 'complete'
    ? Check
    : status === 'error'
      ? CircleAlert
      : LoaderCircle;

  return (
    <figure
      data-beui-surface="image-generation"
      data-state={status}
      aria-busy={active}
      className={cn('mt-2 w-full max-w-xl', className)}
    >
      <div
        role="img"
        aria-label={label ?? (prompt ? `${resolvedStatus}: ${prompt}` : resolvedStatus)}
        style={{ aspectRatio }}
        className="relative isolate w-full overflow-hidden rounded-2xl border border-border/65 bg-muted/45 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none"
      >
        <motion.div
          initial={false}
          animate={{ opacity: children ? 1 : 0, scale: children ? 1 : 1.01 }}
          transition={{ duration: reduceMotion ? 0 : DURATION_BASE, ease: EASE_OUT }}
          className="absolute inset-0 [&>*]:size-full [&>*]:object-cover"
        >
          {children}
        </motion.div>

        {active ? (
          <div className="absolute inset-0 grid place-items-center bg-muted/85">
            <motion.div
              aria-hidden="true"
              animate={reduceMotion ? undefined : { opacity: [0.35, 0.8, 0.35] }}
              transition={{ duration: 1.8, repeat: Number.POSITIVE_INFINITY, ease: EASE_OUT }}
              className="grid size-12 place-items-center rounded-2xl border border-border/60 bg-background/70 text-muted-foreground"
            >
              <ImageIcon className="size-5" />
            </motion.div>
          </div>
        ) : null}

        {resolution ? (
          <span className="absolute right-2 top-2 z-10 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
            {resolution}
          </span>
        ) : null}
      </div>

      <figcaption className="mt-2 flex min-w-0 items-start gap-2 px-1">
        <StatusIcon
          aria-hidden="true"
          className={cn(
            'mt-0.5 size-3.5 shrink-0',
            active && !reduceMotion && 'animate-spin',
            status === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-muted-foreground',
          )}
        />
        <span className="min-w-0">
          <span className="block text-[12px] font-medium text-foreground/90">{resolvedStatus}</span>
          {prompt ? (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">“{prompt}”</span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  );
}
