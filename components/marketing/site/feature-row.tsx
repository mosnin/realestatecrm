/**
 * FeatureRow — a single alternating deep-feature row, shared across sub-pages.
 *
 * Copy on one side, a framed screenshot slot on the other, flipping with
 * `flip`. Same vocabulary as the home Features section so realtors, brokerages,
 * etc. all read as one site. Numbered eyebrow optional.
 */

import { Check } from 'lucide-react';
import { Reveal } from './reveal';
import { PanelFrame, ImagePlaceholder } from './frame';

export interface FeatureRowProps {
  no?: string;
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
  points: string[];
  image: { label: string; sublabel?: string };
  /** A live product panel rendered inside the frame. Falls back to a labeled
   *  placeholder when omitted. */
  panel?: React.ReactNode;
  flip?: boolean;
}

export function FeatureRow({
  no,
  eyebrow,
  title,
  sub,
  points,
  image,
  panel,
  flip,
}: FeatureRowProps) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <Reveal from={flip ? 'right' : 'left'} className={flip ? 'lg:order-2' : ''}>
        <div className="flex items-center gap-3">
          {no ? <span className="text-sm font-semibold tabular-nums text-brand">{no}</span> : null}
          <span className="h-px w-8 bg-border" />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </span>
        </div>
        <h2 className="mt-5 text-[26px] font-semibold leading-[1.2] tracking-tight text-foreground sm:text-[32px]">
          {title}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{sub}</p>
        <ul className="mt-6 space-y-3">
          {points.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-foreground/85">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-subtle">
                <Check className="h-3 w-3 text-brand" />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal from={flip ? 'left' : 'right'} className={flip ? 'lg:order-1' : ''}>
        <PanelFrame>
          {panel ?? <ImagePlaceholder label={image.label} sublabel={image.sublabel} ratio="aspect-[4/3]" />}
        </PanelFrame>
      </Reveal>
    </div>
  );
}
