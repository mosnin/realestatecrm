'use client';

/**
 * 3D interactive navbar (from 21st.dev "3d-interactive-navbar"), tailored to Chippi.
 *
 * Dark, deliberately heavy: a pointer-tilted card on the left, "decrypt"
 * glitch text on the nav links, and an animated mega-dropdown. The aesthetic
 * is intentional, do not calm it down. Only the CONTENT is Chippi.
 *
 * The left card used to be a Three.js reflective mesh. It is now a pure
 * CSS/DOM card with a perspective tilt driven by the pointer, so the file has
 * no WebGL dependency and renders fine under SSR. Keep 'use client' at the top
 * for the framer-motion and pointer state.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// ----------------------------------------------------------------------------
// Tilt card (pure CSS, no WebGL)
// ----------------------------------------------------------------------------

/**
 * TiltCard — a small dark card that tilts toward the pointer. Replaces the old
 * Three.js reflective mesh. The tilt is driven by `mousePosition` (range -1..1
 * on each axis), the same signal the logo wrapper already computed for the
 * mesh, so the parallax feel is preserved with zero dependencies.
 */
function TiltCard({ mousePosition }: { mousePosition: { x: number; y: number } }) {
  // Pointer y tilts around X, pointer x tilts around Y. Cap at a gentle angle.
  const rotateX = (mousePosition.y * 14).toFixed(2);
  const rotateY = (mousePosition.x * 14).toFixed(2);

  return (
    <div
      aria-hidden
      className="h-full w-full overflow-hidden rounded-[10px] border border-neutral-800 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
      style={{
        transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
        transition: 'transform 0.15s ease-out',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Soft sheen so the card reads as glassy, like the old material. */}
      <div className="h-full w-full bg-gradient-to-tr from-transparent via-white/5 to-indigo-300/20" />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Decrypt (glitch) text effect
// ----------------------------------------------------------------------------

const GLYPHS = '!<>-_\\/[]{}—=+*^?#________';

function useDecrypt(text: string, active: boolean) {
  const [display, setDisplay] = useState(text);
  const frame = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      setDisplay(text);
      if (raf.current) cancelAnimationFrame(raf.current);
      return;
    }

    frame.current = 0;
    const totalFrames = text.length * 3;

    const tick = () => {
      const progress = frame.current / 3;
      const out = text
        .split('')
        .map((char, i) => {
          if (i < progress) return char;
          if (char === ' ') return ' ';
          return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        })
        .join('');
      setDisplay(out);
      frame.current += 1;
      if (frame.current <= totalFrames) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setDisplay(text);
      }
    };

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [active, text]);

  return display;
}

function DecryptEffect({ text, active }: { text: string; active: boolean }) {
  const display = useDecrypt(text, active);
  return <span className="font-mono tracking-tight">{display}</span>;
}

/**
 * StableDecryptEffect — runs the decrypt once on mount (used for the mega
 * dropdown headline so it animates in when the panel opens).
 */
function StableDecryptEffect({ text }: { text: string }) {
  const [active, setActive] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setActive(false), text.length * 60 + 300);
    return () => clearTimeout(t);
  }, [text]);
  const display = useDecrypt(text, active);
  return <span className="font-mono">{display}</span>;
}

// ----------------------------------------------------------------------------
// Nav item with decrypt hover
// ----------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'Log in', href: '/login/realtor' },
];

function NavbarItem({ item }: { item: NavItem }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={item.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative px-3 py-2 text-sm text-white/70 transition-colors hover:text-white"
    >
      <DecryptEffect text={item.label} active={hovered} />
    </Link>
  );
}

// ----------------------------------------------------------------------------
// Mega-dropdown content
// ----------------------------------------------------------------------------

interface ProductItem {
  id: string;
  title: string;
  url: string;
  previewImage: string;
  desc: string;
}

const productItems: ProductItem[] = [
  {
    id: 'realtors',
    title: 'Realtors',
    url: '/realtors',
    previewImage: '/marketing/product/realtors.jpg',
    desc: 'An extra teammate in the field.',
  },
  {
    id: 'brokerages',
    title: 'Brokerages',
    url: '/brokerages',
    previewImage: '/marketing/product/brokerages.jpg',
    desc: 'One agent for the whole floor.',
  },
  {
    id: 'integrations',
    title: 'Integrations',
    url: '/integrations',
    previewImage: '/marketing/product/integrations.jpg',
    desc: 'Your whole stack, connected.',
  },
  {
    id: 'live-demo',
    title: 'Live demo',
    url: '/demo-app',
    previewImage: '/marketing/product/live-demo.jpg',
    desc: 'Click through the product.',
  },
  {
    id: 'book-demo',
    title: 'Book a demo',
    url: '/demo',
    previewImage: '/marketing/product/book-demo.jpg',
    desc: 'See Chippi run your floor.',
  },
  {
    id: 'company',
    title: 'Company',
    url: '/company',
    previewImage: '/marketing/product/company.jpg',
    desc: 'Why we built Chippi.',
  },
];

function MegaDropdown({ onNavigate }: { onNavigate: () => void }) {
  const [activeId, setActiveId] = useState(productItems[0].id);
  const active = productItems.find((p) => p.id === activeId) ?? productItems[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="absolute left-1/2 top-full z-50 mt-3 w-[760px] max-w-[92vw] -translate-x-1/2"
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/90 shadow-2xl backdrop-blur-xl">
        <div className="grid grid-cols-[1.1fr_1fr]">
          {/* Left: headline + list */}
          <div className="border-r border-white/10 p-6">
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
              _PRODUCT
            </p>
            <h3 className="mb-5 text-lg font-medium text-white">
              <StableDecryptEffect text="Everything Chippi runs for you." />
            </h3>
            <ul className="space-y-1">
              {productItems.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.url}
                    onMouseEnter={() => setActiveId(item.id)}
                    onClick={onNavigate}
                    className={cn(
                      'group flex flex-col rounded-lg px-3 py-2 transition-colors',
                      activeId === item.id
                        ? 'bg-white/[0.06]'
                        : 'hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="text-sm font-medium text-white">{item.title}</span>
                    <span className="text-xs text-white/50">{item.desc}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: preview */}
          <div className="relative p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="flex h-full flex-col"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10">
                  {/* Local stock image; no runtime hotlinking. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={active.previewImage}
                    alt={active.title}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </div>
                <p className="mt-4 text-sm text-white/70">{active.desc}</p>
                <Link
                  href={active.url}
                  onClick={onNavigate}
                  className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition-colors hover:bg-white hover:text-black"
                >
                  Explore
                  <span aria-hidden>&rarr;</span>
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ComponentsLink() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }, []);

  const handleLeave = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, []);

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        type="button"
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] transition-colors',
          open ? 'text-white' : 'text-white/70 hover:text-white',
        )}
      >
        PRODUCT
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          aria-hidden
          className="text-[10px]"
        >
          &darr;
        </motion.span>
      </button>
      <AnimatePresence>
        {open && <MegaDropdown onNavigate={() => setOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Mobile menu
// ----------------------------------------------------------------------------

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 top-20 z-40 overflow-y-auto bg-black md:hidden"
        >
          <div className="space-y-8 px-6 py-8">
            <div>
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-white/40">
                _PRODUCT
              </p>
              <ul className="space-y-1">
                {productItems.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.url}
                      onClick={onClose}
                      className="flex flex-col rounded-lg px-3 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <span className="text-base font-medium text-white">{item.title}</span>
                      <span className="text-sm text-white/50">{item.desc}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-1 border-t border-white/10 pt-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="block rounded-lg px-3 py-3 text-base text-white/80 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/login/realtor?intent=signup"
                onClick={onClose}
                className="mt-3 block rounded-full bg-white px-4 py-3 text-center text-base font-medium text-black"
              >
                Start free
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ----------------------------------------------------------------------------
// Navbar
// ----------------------------------------------------------------------------

export function Navbar() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = logoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    setMousePosition({ x, y });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePosition({ x: 0, y: 0 });
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 md:px-8">
        {/* Logo + tilt card */}
        <div
          ref={logoRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="flex items-center gap-3"
        >
          <div className="relative h-12 w-12">
            <TiltCard mousePosition={mousePosition} />
          </div>
          <Link href="/" aria-label="Chippi home" className="flex items-center">
            {/* Bar is always black, so use the white logo directly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-white.png" alt="Chippi" className="h-5 w-auto" />
          </Link>
        </div>

        {/* Center: product mega-dropdown (desktop) */}
        <div className="hidden md:flex">
          <ComponentsLink />
        </div>

        {/* Right: nav items + CTA */}
        <div className="flex items-center gap-1">
          <div className="hidden items-center md:flex">
            {navItems.map((item) => (
              <NavbarItem key={item.href} item={item} />
            ))}
          </div>
          <Link
            href="/login/realtor?intent=signup"
            className="ml-2 hidden h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-black transition-opacity hover:opacity-90 md:inline-flex"
          >
            Start free
          </Link>

          {/* Mobile trigger */}
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center text-white md:hidden"
          >
            <span className="relative flex h-4 w-5 flex-col justify-between">
              <span
                className={cn(
                  'h-0.5 w-full bg-white transition-transform',
                  mobileOpen && 'translate-y-[7px] rotate-45',
                )}
              />
              <span
                className={cn(
                  'h-0.5 w-full bg-white transition-opacity',
                  mobileOpen && 'opacity-0',
                )}
              />
              <span
                className={cn(
                  'h-0.5 w-full bg-white transition-transform',
                  mobileOpen && '-translate-y-[7px] -rotate-45',
                )}
              />
            </span>
          </button>
        </div>
      </nav>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <style jsx>{`
        nav {
          font-feature-settings: 'ss01';
        }
      `}</style>
    </header>
  );
}

export default Navbar;
