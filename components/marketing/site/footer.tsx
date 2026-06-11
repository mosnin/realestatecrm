/**
 * Footer — the black contrast card.
 *
 * An inset rounded near-black card on the canvas (the Arist-style close):
 * a big display sign-off line + the signal CTA up top, link columns below,
 * meta row at the bottom. Replaces the paper-flat hairline footer.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const columns = {
  Product: [
    { label: 'For realtors', href: '/realtors' },
    { label: 'For brokerages', href: '/brokerages' },
    { label: 'Integrations', href: '/integrations' },
    { label: 'Pricing', href: '/pricing' },
  ],
  Company: [
    { label: 'Company', href: '/company' },
    { label: 'Book a demo', href: '/demo' },
    { label: 'Status', href: '/status' },
    { label: 'Log in', href: '/login/realtor' },
  ],
  Legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Legal', href: '/legal' },
  ],
};

export function SiteFooter() {
  return (
    <footer className="px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#0d0d0f] text-white sm:rounded-[2.75rem]">
        <div className="px-5 py-14 sm:px-10 sm:py-16 lg:px-14">
          {/* Sign-off + CTA */}
          <div className="flex flex-col gap-8 border-b border-white/10 pb-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">
                <span aria-hidden className="text-[#ff7a47]">✦</span>
                Chippi
              </p>
              <p className="font-display mt-4 max-w-md text-3xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-4xl">
                The busywork runs itself. The hours go to closing.
              </p>
            </div>
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 pt-12 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <p className="max-w-xs text-sm leading-relaxed text-white/55">
                The agentic OS for real-estate agents and brokerages — every
                realtor with Chippi doing real work for them.
              </p>
            </div>
            {Object.entries(columns).map(([heading, items]) => (
              <div key={heading}>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {heading}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {items.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-white/65 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Meta row */}
          <div className="mt-12 flex flex-col items-center gap-2 border-t border-white/10 pt-6 sm:flex-row sm:justify-between">
            <p className="text-xs text-white/40">
              &copy; {new Date().getFullYear()} Chippi. All rights reserved.
            </p>
            <Link
              href="/status"
              className="inline-flex items-center gap-2 text-xs text-white/40 transition-colors hover:text-white"
            >
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-400" />
              All systems operational.
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
