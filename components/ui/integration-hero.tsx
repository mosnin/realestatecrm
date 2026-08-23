"use client";

/**
 * IntegrationHero, the provided two-row counter-scrolling icon marquee,
 * exact: floating white icon coins (flaticon brand set, per the source),
 * grid backdrop, fade edges. Copy + CTA tailored to Chippi. Animation
 * classes live in globals (animate-scroll-left/right, reduced-motion aware).
 */

import Link from "next/link";
import React from "react";

const ICONS_ROW1 = [
  "https://cdn-icons-png.flaticon.com/512/5968/5968854.png",
  "https://cdn-icons-png.flaticon.com/512/732/732221.png",
  "https://cdn-icons-png.flaticon.com/512/733/733609.png",
  "https://cdn-icons-png.flaticon.com/512/732/732084.png",
  "https://cdn-icons-png.flaticon.com/512/733/733585.png",
  "https://cdn-icons-png.flaticon.com/512/281/281763.png",
  "https://cdn-icons-png.flaticon.com/512/888/888879.png",
];

const ICONS_ROW2 = [
  "https://cdn-icons-png.flaticon.com/512/174/174857.png",
  "https://cdn-icons-png.flaticon.com/512/906/906324.png",
  "https://cdn-icons-png.flaticon.com/512/888/888841.png",
  "https://cdn-icons-png.flaticon.com/512/5968/5968875.png",
  "https://cdn-icons-png.flaticon.com/512/906/906361.png",
  "https://cdn-icons-png.flaticon.com/512/732/732190.png",
  "https://cdn-icons-png.flaticon.com/512/888/888847.png",
];

// Utility to repeat icons enough times
const repeatedIcons = (icons: string[], repeat = 4) =>
  Array.from({ length: repeat }).flatMap(() => icons);

export default function IntegrationHero() {
  return (
    <section className="relative overflow-hidden bg-background pb-20 pt-32 sm:pt-36">
      {/* Light grid background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.04)_1px,transparent_1px)] [background-size:24px_24px] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_1px,transparent_1px)]" />

      {/* Content */}
      <div className="relative mx-auto max-w-7xl px-6 text-center">
        <span className="mb-4 inline-block rounded-full border border-border/70 bg-background px-3 py-1 text-sm text-foreground">
          ⚡ Integrations
        </span>
        <h1
          className="text-4xl tracking-tight text-foreground lg:text-6xl"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Works with your favorite tools
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Inbox, calendar, CRM, and dozens of other apps connect in about
          two minutes. Chippi calls each one as a tool while it works, no
          migration, no double entry.
        </p>
        <Link
          href="/sign-up"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition hover:bg-foreground/90"
        >
          Get started
        </Link>

        {/* Carousel */}
        <div className="relative mt-12 overflow-hidden pb-2">
          {/* Row 1 */}
          <div className="animate-scroll-left flex w-max gap-10 whitespace-nowrap">
            {repeatedIcons(ICONS_ROW1, 4).map((src, i) => (
              <div
                key={i}
                className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-md dark:bg-gray-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="integration icon" className="h-10 w-10 object-contain" />
              </div>
            ))}
          </div>

          {/* Row 2 */}
          <div className="animate-scroll-right mt-6 flex w-max gap-10 whitespace-nowrap">
            {repeatedIcons(ICONS_ROW2, 4).map((src, i) => (
              <div
                key={i}
                className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-md dark:bg-gray-300"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="integration icon" className="h-10 w-10 object-contain" />
              </div>
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
