"use client";

/**
 * IntegrationHero — the provided two-row counter-scrolling icon marquee,
 * tailored to Chippi: the tiles carry the REAL integrations from the catalog
 * (initial-mark tiles, no flaticon hotlinks to 404), the copy speaks Chippi,
 * and the CTA is a real link. Animation classes live in globals
 * (animate-scroll-left/right, reduced-motion aware).
 */

import Link from "next/link";
import React from "react";

const ROW_1 = ["Gmail", "Outlook", "Google Calendar", "Calendly", "WhatsApp", "Slack", "HubSpot"];
const ROW_2 = ["Follow-up Boss", "kvCORE", "Compass", "Salesforce", "DocuSign", "Notion", "Google Drive"];

// Utility to repeat icons enough times
const repeated = (items: string[], repeat = 4) => Array.from({ length: repeat }).flatMap(() => items);

function IntegrationTile({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-16 flex-shrink-0 items-center gap-3 rounded-full border border-border/70 bg-card px-5 shadow-md shadow-foreground/5">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand">
        {initials}
      </span>
      <span className="whitespace-nowrap text-sm font-medium text-foreground">{name}</span>
    </div>
  );
}

export default function IntegrationHero() {
  return (
    <section className="relative overflow-hidden bg-background pb-20 pt-32 sm:pt-36">
      {/* Light grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,var(--border)_1px,transparent_1px)] opacity-50 [background-size:24px_24px]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
      />

      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-6 text-center">
        <span className="mb-4 inline-block rounded-full border border-border/70 bg-background px-3 py-1 text-sm text-foreground">
          Integrations
        </span>
        <h1
          className="text-4xl tracking-tight text-foreground lg:text-6xl"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Works with the tools you already use
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          50+ apps connect in two minutes. Chippi calls each one as a tool while it
          works — no migration, no double entry.
        </p>
        <Link
          href="/login/realtor?intent=signup"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
        >
          Get started
        </Link>

        {/* Carousel */}
        <div className="relative mt-12 overflow-hidden pb-2">
          {/* Row 1 */}
          <div className="animate-scroll-left flex w-max gap-6 whitespace-nowrap">
            {repeated(ROW_1, 4).map((name, i) => (
              <IntegrationTile key={`r1-${i}`} name={name} />
            ))}
          </div>

          {/* Row 2 */}
          <div className="animate-scroll-right mt-6 flex w-max gap-6 whitespace-nowrap">
            {repeated(ROW_2, 4).map((name, i) => (
              <IntegrationTile key={`r2-${i}`} name={name} />
            ))}
          </div>

          {/* Fade overlays */}
          <div className="pointer-events-none absolute left-0 top-0 h-full w-24 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-background to-transparent" />
        </div>
      </div>
    </section>
  );
}
