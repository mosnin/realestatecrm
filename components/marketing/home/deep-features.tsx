'use client';

/**
 * DeepFeatures — the surfaces we didn't lead with: Studio, Files, the team
 * layer, the connected inbox. Light-canvas card board (ref: Aura VPN
 * "Everything you need"). A small-caps section label, a bold headline, then
 * a three-up row of feature cards over a two-up media row.
 */

import { Reveal, Stagger, StaggerItem, Eyebrow, Placeholder } from './home-kit';
import { Aperture, FolderOpen, Users } from 'lucide-react';

const FEATURES = [
  {
    icon: Aperture,
    title: 'Studio writes the post.',
    body: 'Listing copy, the email blast, the social post — generated from the property record, scheduled to your channels.',
  },
  {
    icon: FolderOpen,
    title: 'Files that belong to the deal.',
    body: 'Contracts, photos, signed PDFs — filed per deal, searchable, versioned. Chippi files them for you.',
  },
  {
    icon: Users,
    title: 'A team layer brokers actually open.',
    body: 'Route leads, share templates, see what the floor is closing — while every realtor keeps their own workspace.',
  },
];

export function DeepFeatures() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
      <Reveal className="max-w-3xl">
        <Eyebrow>The rest of the workspace</Eyebrow>
        <h2 className="mt-5 text-[clamp(2rem,4.8vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-foreground">
          One agent. Every corner of the job.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-foreground/55">
          The inbox is where it starts. Chippi reaches everywhere the work
          lives — so you never leave to get something done.
        </p>
      </Reveal>

      <Stagger className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <StaggerItem key={f.title}>
              <div className="flex h-full flex-col rounded-3xl bg-card p-7 ring-1 ring-border/70 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.10)] md:p-8">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-foreground/55">
                  {f.body}
                </p>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      <Stagger className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5" amount={0.15}>
        <StaggerItem>
          <div className="flex h-full flex-col rounded-3xl bg-card p-7 ring-1 ring-border/70 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.10)] md:p-8">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              Speak; your workspace responds.
            </h3>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-foreground/55">
              Ask Chippi in plain language. It drafts, books, files, and
              updates — then shows you what it did before anything ships.
            </p>
            <Placeholder label="Chippi command bar" aspect="aspect-[16/9]" className="mt-7" />
          </div>
        </StaggerItem>
        <StaggerItem>
          <div className="flex h-full flex-col rounded-3xl bg-card p-7 ring-1 ring-border/70 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.10)] md:p-8">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              Approval-first, always.
            </h3>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-foreground/55">
              Chippi never sends, books, or changes a record without your tap.
              Grant per-task autonomy when you trust it. You stay in the seat.
            </p>
            <Placeholder label="Approval panel" aspect="aspect-[16/9]" className="mt-7" />
          </div>
        </StaggerItem>
      </Stagger>
    </section>
  );
}
