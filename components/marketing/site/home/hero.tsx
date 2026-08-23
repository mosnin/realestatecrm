'use client';

/**
 * Hero, the Supermi composition, exact.
 *
 * One big rounded pastel card: soft white-to-peach/pink gradient with a
 * faint grid. The site's floating pill nav (SiteNav) hovers above the card;
 * inside, the centered stack, white uppercase badge pill, giant near-black
 * display headline, two-line gray sub, single white "Get Started" pill, 
 * and the app window slot at the bottom, clipped by the card edge.
 *
 * The window is the ARCADE DEMO: the owner's popout embed. A hidden fixed
 * iframe (height 0) hosts the tour; the window shows the demo's cover
 * screenshot and, on click, posts `request-popout-open`, the Arcade
 * handler expands the iframe fullscreen and collapses it on close, per the
 * provided embed script.
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Play } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

const ARCADE_ID = 'NQCViB7eeI8K9ZCIUT9s';
const ARCADE_SRC = `https://demo.arcade.software/${ARCADE_ID}?embed&embed_custom&show_copy_link=true`;
const ARCADE_COVER =
  'https://cdn.arcade.software/cdn-cgi/image/width=960,fit=scale-down,format=auto,quality=90,dpr=2/extension-uploads%2FNQCViB7eeI8K9ZCIUT9s%2Fimage%2Fb9a7d24f-b6ee-44a8-9030-852128020d0e.png';

/* The card's pastel backdrop: white top melting into pink (bottom-left) and
 * peach (bottom-right), plus a faint 64px grid, per the reference image. */
const CARD_BG: React.CSSProperties = {
  backgroundColor: '#f6f4f5',
  backgroundImage: [
    'linear-gradient(rgba(20,16,24,0.035) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(20,16,24,0.035) 1px, transparent 1px)',
    'radial-gradient(120% 90% at 88% 102%, #ffd2a8 0%, rgba(255,210,168,0) 55%)',
    'radial-gradient(120% 90% at 10% 102%, #ffc4dd 0%, rgba(255,196,221,0) 55%)',
    'radial-gradient(100% 75% at 50% 0%, #ffffff 0%, rgba(255,255,255,0) 70%)',
  ].join(', '),
  backgroundSize: '64px 64px, 64px 64px, 100% 100%, 100% 100%, 100% 100%',
};

function Enter({
  delay,
  children,
  className,
}: {
  delay: number;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** The dashboard window, Arcade popout demo (owner's embed, ported). */
function ArcadeSlot() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // The provided embed script's message handler, scoped to our iframe ref.
  useEffect(() => {
    function onArcadeIframeMessage(e: MessageEvent) {
      if (e.origin !== 'https://demo.arcade.software' || !e.isTrusted) return;
      const arcadeIframe = iframeRef.current;
      if (!arcadeIframe || !arcadeIframe.contentWindow) return;
      const data = e.data as { id?: string; event?: string } | undefined;
      if (!data || (data.id && !ARCADE_SRC.includes(data.id))) return;
      if (data.event === 'arcade-init') {
        arcadeIframe.contentWindow.postMessage({ event: 'register-popout-handler' }, '*');
      }
      if (data.event === 'arcade-popout-open') {
        arcadeIframe.style.height = '100%';
        arcadeIframe.style.zIndex = '9999999';
      }
      if (data.event === 'arcade-popout-close') {
        arcadeIframe.style.height = '0';
        arcadeIframe.style.zIndex = 'auto';
      }
    }
    window.addEventListener('message', onArcadeIframeMessage);

    // Register on mount too, not only on arcade-init, so a popout request
    // works even when arcade-init fired before this listener attached. Captured
    // for the unmount cleanup, which unregisters the handler.
    const arcadeIframe = iframeRef.current;
    arcadeIframe?.contentWindow?.postMessage({ event: 'register-popout-handler' }, '*');

    return () => {
      arcadeIframe?.contentWindow?.postMessage({ event: 'unregister-popout-handler' }, '*');
      window.removeEventListener('message', onArcadeIframeMessage);
    };
  }, []);

  const openTour = () => {
    iframeRef.current?.contentWindow?.postMessage({ event: 'request-popout-open' }, '*');
  };

  return (
    <>
      {/* Hidden fixed iframe, expands fullscreen when the popout opens. */}
      <iframe
        ref={iframeRef}
        src={ARCADE_SRC}
        title="Mark a Real Estate Deal as Won in the Pipeline"
        loading="lazy"
        allowFullScreen
        allow="clipboard-write"
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: 0, colorScheme: 'light', border: 0 }}
      />

      {/* The window: demo cover screenshot, click to start the tour. */}
      <button
        type="button"
        onClick={openTour}
        id="arcade-demo-slot"
        aria-label="Watch the interactive product tour"
        className="group relative mx-auto -mb-px block h-[380px] w-full max-w-5xl cursor-pointer overflow-hidden rounded-t-[22px] bg-white/95 text-left shadow-[0_30px_80px_-24px_rgba(90,45,20,0.28)] ring-1 ring-black/5 sm:h-[500px]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ARCADE_COVER}
          alt="Chippi dashboard, interactive tour preview"
          className="h-full w-full object-cover object-top"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/10">
          <span className="flex items-center gap-3 rounded-full bg-white/95 py-3 pl-4 pr-6 shadow-[0_12px_36px_rgba(20,10,5,0.25)] transition-transform duration-200 group-hover:scale-[1.04]">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29] text-white">
              <Play className="ml-0.5 h-4 w-4" />
            </span>
            <span className="font-sans text-[15px] font-semibold tracking-tight text-[#15131a]">
              Watch the tour
            </span>
          </span>
        </span>
      </button>
    </>
  );
}

export function Hero() {
  return (
    <section className="px-2.5 pt-2.5 sm:px-4 sm:pt-4">
      <div
        className="relative isolate mx-auto max-w-[1400px] overflow-hidden rounded-[2rem] sm:rounded-[2.5rem]"
        style={CARD_BG}
      >
        {/* Centered stack, top padding clears the site's floating pill nav */}
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 pt-28 text-center sm:pt-32">
          <Enter delay={0.05}>
            <span className="inline-flex items-center rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#1c1720] shadow-[0_2px_12px_rgba(40,20,10,0.08)]">
              Your AI teammate for real estate
            </span>
          </Enter>

          <Enter delay={0.12}>
            <h1 className="font-display mt-7 text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#1d1922] sm:text-6xl lg:text-[4.5rem]">
              Empower Your
              <span className="block">Deals with a Next-Gen</span>
              <span className="block">AI Teammate</span>
            </h1>
          </Enter>

          <Enter delay={0.2}>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#6f6a73] sm:text-lg">
              Unlock seamless follow-up and streamline your whole pipeline with
              an agent that drafts, books, and logs the work for you
            </p>
          </Enter>

          <Enter delay={0.28}>
            <Link
              href="/sign-up"
              className="mt-9 inline-flex items-center rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold text-[#15131a] shadow-[0_10px_28px_rgba(40,20,10,0.12)] transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
            >
              Get Started
            </Link>
          </Enter>
        </div>

        {/* App window, the arcade.so demo slot, clipped by the card bottom */}
        <Enter delay={0.4} className="mt-12 px-4 sm:mt-16 sm:px-10">
          <ArcadeSlot />
        </Enter>
      </div>
    </section>
  );
}
