/**
 * Footer, the pastel bookend.
 *
 * An inset rounded card washed white → soft peach/pink (mirroring the hero
 * card, per the white + pastel-orange direction): display sign-off line +
 * the signal CTA up top, link columns below, meta row at the bottom.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const columns = {
  Product: [
    { label: 'For real estate agents', href: '/realtors' },
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
    <footer className="px-3 pb-3 pt-16 sm:px-4 sm:pb-4 sm:pt-24">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-white via-[#fff3ea] to-[#ffe2d2] text-[#16161a] ring-1 ring-black/5 sm:rounded-[2.75rem]">
        <div className="px-5 py-14 sm:px-10 sm:py-16 lg:px-14">
          {/* Sign-off + CTA */}
          <div className="flex flex-col gap-8 border-b border-black/10 pb-12 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                <span aria-hidden className="text-[#ff4b29]">✦</span>
                Chippi
              </p>
              <p className="mt-4 max-w-md text-3xl font-bold leading-[1.05] tracking-[-0.03em] text-zinc-950 sm:text-4xl">
                Turn more leads into booked tours.
              </p>
            </div>
            <Link
              href="/sign-up"
              className="inline-flex h-12 w-fit items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 pt-12 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              <p className="max-w-xs text-sm leading-relaxed text-neutral-600">
                Your AI lead conversion teammate. Chippi reads every inquiry,
                ranks intent, drafts the next reply, and keeps tours moving.
              </p>
            </div>
            {Object.entries(columns).map(([heading, items]) => (
              <div key={heading}>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  {heading}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {items.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-neutral-600 transition-colors hover:text-zinc-950"
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
          <div className="mt-12 flex flex-col items-center gap-2 border-t border-black/10 pt-6 sm:flex-row sm:justify-between">
            <p className="text-xs text-neutral-500">
              &copy; {new Date().getFullYear()} Chippi. All rights reserved.
            </p>
            <Link
              href="/status"
              className="inline-flex items-center gap-2 text-xs text-neutral-500 transition-colors hover:text-zinc-950"
            >
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-500" />
              All systems operational.
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
