/**
 * `/files` — every document filed to the right deal, on the white + pastel
 * system.
 *
 * Arc: PageHero opener → open light split (copy beside a pastel-framed
 * glass card: incoming attachment auto-filed, then search → filed docs) →
 * white shadow trio (Auto-filing / One search / Deal context) → pastel CTA
 * card. One idea: search is the only filing system you need.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  FileText,
  FolderOpen,
  Mail,
  Search,
} from 'lucide-react';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';
import { CloudCta } from '@/components/marketing/site/home/cloud-cta';

export const metadata = {
  title: 'Files · Chippi',
  description:
    'Contracts, disclosures, listing photos, CMAs — Chippi files every document to the right deal automatically, so you find it in one search instead of digging through folders.',
};

const TRIO: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FolderOpen,
    title: 'Auto-filing.',
    body: 'Every attachment is read, matched to its deal, and filed the moment it lands.',
  },
  {
    icon: Search,
    title: 'One search.',
    body: 'Ask in plain language — the contract, the disclosure, the photo surface without a folder in sight.',
  },
  {
    icon: FileText,
    title: 'Deal context.',
    body: 'Files live on the deal, next to the people, the showings, and the conversation they belong to.',
  },
];

export default function FilesPage() {
  return (
    <div>
      <PageHero
        eyebrow="Files"
        title="Filed to the right deal. Automatically."
        sub="Contracts, disclosures, photos — every document that lands in your inbox is read, matched, and filed to its deal. When you need one, it is one search away."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Open light split — air after the hero */}
      <section className="mx-auto mt-12 max-w-7xl px-6 sm:mt-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Copy, hairline list, stats, quiet link */}
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Stop hunting for the contract.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Every deal drags a paper trail behind it. Chippi keeps the trail
              filed, so search is the only filing system you need.
            </p>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <FolderOpen className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Auto-filed on arrival</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Attachments are read, matched to the deal, and filed the
                      moment they land — no naming conventions, no folders.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Search className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">One search, plain language</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Ask for the 14 Oak St disclosure and it surfaces — with
                      the deal context around it.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">Filing runs around the clock</p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">50+</span>
                  <p className="mt-1 text-xs text-neutral-600">Integrations across email, drive, and CRMs</p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <Link
                href="/chippi"
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-950 transition-colors hover:text-neutral-600"
              >
                See Chippi at work
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Pastel frame, white glass card, filing + search illustration */}
          <div className="relative rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
            <article
              className="relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.65)',
              }}
            >
              <div className="p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">Find anything</h3>
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                    <FolderOpen className="h-4 w-4 text-[#ff4b29]" />
                    Auto-filed
                  </span>
                </div>

                {/* Incoming attachment → filed, then search → results */}
                <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
                  <div className="rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-[10px] tracking-widest text-neutral-500">INCOMING</span>
                      <span className="text-[10px] text-neutral-400">Inbox</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] text-neutral-700">
                      <Mail className="h-3 w-3 flex-shrink-0 text-neutral-400" />
                      <span>disclosure-14-oak.pdf</span>
                      <ArrowRight className="h-3 w-3 text-neutral-300" />
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-[9px] font-medium text-[#ff4b29]">
                        <FolderOpen className="h-3 w-3" />
                        14 Oak St
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-2">
                      <Search className="h-3.5 w-3.5 flex-shrink-0 text-neutral-400" />
                      <span className="text-[10px] text-neutral-700">14 Oak St disclosure</span>
                    </div>
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 rounded-lg bg-emerald-50/60 px-2 py-1.5 ring-1 ring-emerald-100">
                        <FileText className="h-3 w-3 flex-shrink-0 text-emerald-600" />
                        <span className="text-[10px] font-medium text-neutral-800">Disclosure.pdf</span>
                        <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                          Top match
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1">
                        <FileText className="h-3 w-3 flex-shrink-0 text-neutral-400" />
                        <span className="text-[10px] text-neutral-600">Purchase agreement.pdf</span>
                        <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] text-neutral-600">
                          14 Oak St
                        </span>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-1">
                        <FileText className="h-3 w-3 flex-shrink-0 text-neutral-400" />
                        <span className="text-[10px] text-neutral-600">Inspection report.pdf</span>
                        <span className="ml-auto rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] text-neutral-600">
                          14 Oak St
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Two-up */}
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">No folders, no naming</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Chippi reads the document and knows where it goes — you
                      never file a thing.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Deal context</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Every file sits next to the people, the showings, and
                      the conversation it belongs to.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* White shadow trio — big air above */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            The filing system
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Filed. Findable. In context.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Three things your documents now do on their own.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:gap-8 lg:grid-cols-3">
          {TRIO.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <item.icon className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{item.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Break-up closer */}
      <div className="mt-24 sm:mt-32">
        <CloudCta />
      </div>
    </div>
  );
}
