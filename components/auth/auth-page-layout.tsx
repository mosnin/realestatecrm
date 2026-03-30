'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, User, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';

// ── Testimonials for marquee ─────────────────────────────────────────────────

const testimonials = [
  {
    text: 'Chippi helped me stop guessing. I can see qualified renter leads first and follow up with confidence.',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=faces',
    name: 'Sofia Bennett',
    role: 'Leasing Agent',
    stars: 5,
  },
  {
    text: 'The intake form made my workflow cleaner overnight. Every application arrives with usable context.',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=faces',
    name: 'Marcus Hill',
    role: 'Independent Realtor',
    stars: 5,
  },
  {
    text: 'I finally have one place to review budgets, move-in dates, and score signals before calling.',
    image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop&crop=faces',
    name: 'Elena Brooks',
    role: 'Rental Specialist',
    stars: 5,
  },
  {
    text: 'The scoring summaries are practical. I can quickly decide who needs priority follow-up each morning.',
    image: 'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=120&h=120&fit=crop&crop=faces',
    name: 'Daniel Carter',
    role: 'Broker Associate',
    stars: 5,
  },
  {
    text: 'Chippi gives me a polished intake flow that clients trust, and it saves me hours every week.',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=faces',
    name: 'Priya Shah',
    role: 'Solo Agent',
    stars: 5,
  },
  {
    text: 'I used to juggle DMs and notes. Now I open one dashboard and know exactly where to start.',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=faces',
    name: 'Noah Reed',
    role: 'Leasing Consultant',
    stars: 5,
  },
];

function HorizontalMarquee({ items, duration }: { items: typeof testimonials; duration: number }) {
  return (
    <motion.div
      animate={{ translateX: '-50%' }}
      transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
      className="flex gap-4 pr-4"
    >
      {[0, 1].map((_, idx) => (
        <React.Fragment key={idx}>
          {items.map((t, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[280px] rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-4 shadow-lg"
            >
              <div className="flex items-center gap-0.5 mb-2">
                {[...Array(t.stars)].map((_, s) => (
                  <Star key={s} size={10} className="fill-primary text-primary" />
                ))}
              </div>
              <p className="text-[12px] leading-relaxed text-white/80 mb-3 line-clamp-3">{t.text}</p>
              <div className="flex items-center gap-2">
                <img src={t.image} alt="" className="w-7 h-7 rounded-full object-cover ring-1 ring-white/20" width={28} height={28} />
                <div>
                  <p className="text-[12px] font-medium text-white/90 leading-tight">{t.name}</p>
                  <p className="text-[10px] text-white/50">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </React.Fragment>
      ))}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════

export interface AuthPageLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading: string;
  variant?: 'realtor' | 'broker';
}

export function AuthPageLayout({ children, heading, subheading, variant }: AuthPageLayoutProps) {
  const pathname = usePathname();

  const isBrokerLogin = pathname.startsWith('/login/broker');
  const isRealtorLogin = pathname.startsWith('/login/realtor');
  const isLoginPage = isBrokerLogin || isRealtorLogin;
  const showRoleSwitcher = isLoginPage;

  return (
    <main className="relative min-h-screen bg-background lg:flex lg:h-screen lg:overflow-y-auto lg:overflow-x-hidden">

      {/* ── Left form panel ── */}
      <div className="relative flex w-full min-h-screen flex-col bg-card px-6 py-6 sm:px-10 sm:py-8 lg:min-h-0 lg:w-[480px] lg:min-w-[480px] lg:overflow-y-auto lg:py-10">

        {/* Logo */}
        <div className="shrink-0">
          <BrandLogo className="h-6 sm:h-7" alt="Chippi" />
        </div>

        {/* Form area */}
        <div className="flex flex-1 flex-col justify-center py-6 sm:py-8 lg:py-0">
          <div className="mx-auto w-full max-w-[380px]">

            {/* Role switcher — fully rounded */}
            {showRoleSwitcher && (
              <div role="tablist" aria-label="Account type" className="mb-6 flex rounded-full border border-border bg-muted/50 p-1">
                <Link
                  href="/login/realtor"
                  role="tab"
                  aria-selected={isRealtorLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isRealtorLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <User size={16} className="shrink-0 sm:size-[14px]" />
                  Realtor
                </Link>
                <Link
                  href="/login/broker"
                  role="tab"
                  aria-selected={isBrokerLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isBrokerLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Building2 size={16} className="shrink-0 sm:size-[14px]" />
                  Broker
                </Link>
              </div>
            )}

            {/* Heading — "Welcome back" on login pages */}
            {heading && (
              <div className="mb-6 space-y-1.5">
                {isLoginPage && (
                  <p className="text-sm font-medium text-primary mb-1">Welcome back</p>
                )}
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {heading}
                </h1>
                {subheading && (
                  <p className="text-sm text-muted-foreground">{subheading}</p>
                )}
              </div>
            )}

            <div className="w-full">
              {children}
            </div>
          </div>
        </div>

        {/* ToS / Privacy */}
        <p className="shrink-0 pt-4 text-center text-xs text-muted-foreground/70 leading-relaxed sm:text-left">
          By continuing, you agree to our{' '}
          <Link href="/legal/terms" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      {/* ── Right decorative panel ── */}
      <div className="hidden lg:relative lg:block lg:flex-1 overflow-hidden">
        {/* Background image */}
        <img
          aria-hidden="true"
          src="https://images.pexels.com/photos/18541706/pexels-photo-18541706.jpeg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Centred logo watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <BrandLogo className="h-12 opacity-90 brightness-0 invert drop-shadow-lg" alt="" />
        </div>

        {/* Horizontal testimonial marquee at bottom — full width, no gaps */}
        <div className="absolute inset-x-0 bottom-0 z-20">
          <div className="bg-gradient-to-t from-black/70 via-black/40 to-transparent pt-16 pb-5">
            <div className="overflow-hidden w-full">
              <HorizontalMarquee items={testimonials} duration={30} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
