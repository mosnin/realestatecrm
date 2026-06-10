'use client';

/**
 * Hero — full-screen video opener.
 *
 * Recreated to the owner's exact spec: a raw, undimmed background video
 * (no overlay of any kind), Inter typography, a character-by-character
 * headline entrance (30ms stagger, 500ms per character, after a 200ms hold),
 * timed fade-ins for the subheading (800ms), buttons (1200ms), and the
 * "liquid glass" tag card (1400ms, bottom-right on large screens). Content
 * sits at the bottom of the viewport; the site's fixed pill nav floats above.
 *
 * Inter is loaded via next/font (the Next-idiomatic equivalent of the spec's
 * <link> tags — preconnected, self-hosted, no render blocking) and scoped to
 * this section so the logged-in product keeps its own type system.
 *
 * Reduced-motion: everything renders composed immediately — the staggered
 * entrance is the one thing we won't make someone sit through twice.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
});

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4';

const HEADLINE = 'Shaping tomorrow\nwith vision and action.';
const CHAR_DELAY_MS = 30;
const CHAR_DURATION_MS = 500;
const HEADLINE_START_MS = 200;

function useReducedMotionFlag(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return reduce;
}

/** Fades children in after `delay` ms over `duration` ms. */
function FadeIn({
  delay,
  duration = 1000,
  className = '',
  children,
}: {
  delay: number;
  duration?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotionFlag();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(id);
  }, [delay]);
  const shown = visible || reduce;
  return (
    <div
      className={`transition-opacity ${shown ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={{ transitionDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * Character-by-character headline. Splits on \n into lines, each line into
 * chars; every char enters from translateX(-18px) with a stagger of
 * (lineIndex * lineLength * 30ms) + (charIndex * 30ms) after the initial hold.
 */
function AnimatedHeading({ text }: { text: string }) {
  const reduce = useReducedMotionFlag();
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setStarted(true), HEADLINE_START_MS);
    return () => clearTimeout(id);
  }, []);
  const lit = started || reduce;
  const lines = text.split('\n');
  return (
    <h1
      className="mb-4 text-4xl font-normal md:text-5xl lg:text-6xl xl:text-7xl"
      style={{ letterSpacing: '-0.04em' }}
    >
      {lines.map((line, lineIndex) => (
        <span key={lineIndex} className="block">
          {Array.from(line).map((char, charIndex) => (
            <span
              key={charIndex}
              className="inline-block"
              style={{
                opacity: lit ? 1 : 0,
                transform: lit ? 'translateX(0)' : 'translateX(-18px)',
                transition: reduce
                  ? 'none'
                  : `opacity ${CHAR_DURATION_MS}ms, transform ${CHAR_DURATION_MS}ms`,
                transitionDelay: reduce
                  ? '0ms'
                  : `${lineIndex * line.length * CHAR_DELAY_MS + charIndex * CHAR_DELAY_MS}ms`,
              }}
            >
              {char === ' ' ? ' ' : char}
            </span>
          ))}
        </span>
      ))}
    </h1>
  );
}

export function Hero() {
  return (
    <section
      className={`relative h-screen overflow-hidden bg-black text-white antialiased ${inter.className}`}
    >
      {/* Raw video — no overlay, no dimming, per spec. */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
      />

      {/* Content — pinned to the bottom of the viewport. The site's fixed
          pill nav floats above this section; no second navbar here. */}
      <div className="relative z-10 flex h-full flex-col px-6 md:px-12 lg:px-16">
        <div className="flex flex-1 flex-col justify-end pb-12 lg:grid lg:grid-cols-2 lg:items-end lg:pb-16">
          {/* Left — headline, subheading, buttons */}
          <div>
            <AnimatedHeading text={HEADLINE} />
            <FadeIn delay={800}>
              <p className="mb-5 text-base text-gray-300 md:text-lg">
                We back visionaries and craft ventures that define what comes next.
              </p>
            </FadeIn>
            <FadeIn delay={1200}>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/login/realtor?intent=signup"
                  className="rounded-lg bg-white px-8 py-3 font-medium text-black transition-colors hover:bg-gray-100"
                >
                  Start a Chat
                </Link>
                <Link
                  href="/demo"
                  className="liquid-glass rounded-lg border border-white/20 px-8 py-3 font-medium text-white transition-colors hover:bg-white hover:text-black"
                >
                  Explore Now
                </Link>
              </div>
            </FadeIn>
          </div>

          {/* Right — glass tag, bottom-right on large screens */}
          <FadeIn delay={1400} className="mt-8 flex items-end justify-start lg:mt-0 lg:justify-end">
            <div className="liquid-glass rounded-xl border border-white/20 px-6 py-3">
              <p className="text-lg font-light md:text-xl lg:text-2xl">
                Investing. Building. Advisory.
              </p>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
