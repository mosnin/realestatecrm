'use client';

/**
 * FeaturesSplit, the owner-provided light split section, exact.
 *
 * Left: big slate headline, hairline-divided "core features" list with
 * tinted icon circles, a two-up stat row, and the deep-shadow dark gradient
 * button. Right: a pastel-orange gradient rounded-[36px] frame holding a
 * white glass card with a composed mini-dashboard illustration (deal board,
 * Chippi log, progress, avatars), a two-up feature grid, and a quiet text
 * CTA. White scheme + pastel orange, per owner direction.
 *
 * Native design verbatim; blue accents recolored to brand; copy and the
 * illustration's content tailored to Chippi. Stats are defensible facts, 
 * the source's review-count/percent claims were fabricated and are not used.
 */

import Link from 'next/link';
import { ArrowRight, FileText, MessageSquare, Users } from 'lucide-react';

export function FeaturesSplit() {
  return (
    <div className="mx-auto max-w-7xl px-6 pb-16 pt-16">
      <div className="grid gap-12 lg:grid-cols-2">
        {/* Copy & stats */}
        <div>
          <div id="technology">
            <h3 className="font-display text-4xl font-semibold tracking-tight text-slate-900 transition-colors duration-500 dark:text-white sm:text-5xl">
              Seamless follow-up, built for modern real estate
            </h3>

            <div className="mt-8">
              <div className="border-t border-neutral-200 pt-6 dark:border-white/10">
                <h4 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
                  Core Chippi Features
                </h4>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                      <MessageSquare className="h-4 w-4 text-[#ff4b29]" />
                    </div>
                    <div>
                      <h5 className="font-medium text-slate-900 dark:text-white">Instant Drafting</h5>
                      <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
                        Replies written in your voice with the deal history and
                        intake link already in context, ready the moment you ask.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                      <FileText className="h-4 w-4 text-[#ff4b29]" />
                    </div>
                    <div>
                      <h5 className="font-medium text-slate-900 dark:text-white">Smart Pipeline Management</h5>
                      <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
                        Automated stage updates, follow-up scheduling, and plain-language
                        logging, the board reflects today, not last week.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-white/10">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex cursor-pointer items-center gap-3 transition-transform duration-200 hover:scale-105">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">24/7</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-white/60">Chippi works your book around the clock</p>
                </div>
              </div>

              <div className="flex cursor-pointer items-center gap-3 transition-transform duration-200 hover:scale-105">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">100%</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-white/60">Approval-first, nothing sends without you</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-white/10">
            <Link
              href="/chippi"
              role="button"
              className="inline-flex cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-xl border-0 bg-gradient-to-b from-neutral-700 to-neutral-900 px-5 pb-2.5 pt-2.5 text-center align-baseline text-base leading-none text-white no-underline shadow-[0_2.8px_2.2px_rgba(0,_0,_0,_0.034),_0_6.7px_5.3px_rgba(0,_0,_0,_0.048),_0_12.5px_10px_rgba(0,_0,_0,_0.06),_0_22.3px_17.9px_rgba(0,_0,_0,_0.072),_0_41.8px_33.4px_rgba(0,_0,_0,_0.086),_0_100px_80px_rgba(0,_0,_0,_0.12)] outline-none transition-all duration-150 hover:opacity-85 focus:outline-none focus:ring-4 focus:ring-black/50"
            >
              Explore Features
            </Link>
          </div>
        </div>

        {/* Diagram, pastel-gradient frame, white glass card */}
        <div className="relative rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
          <article
            className="group relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl transition-shadow hover:shadow-md"
            style={{
              background: 'rgba(255, 255, 255, 0.72)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.65)',
            }}
          >
            <div className="p-6 sm:p-10">
              <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <h3 className="font-display text-2xl font-semibold tracking-tight text-zinc-950">Chippi Workflows</h3>
                <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                  <Users className="h-4 w-4 text-[#ff4b29]" />
                  Live sync
                </span>
              </div>

              {/* Illustration */}
              <div className="relative mb-8 h-56 rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] ring-1 ring-inset ring-black/5 sm:h-64">
                {/* Deal board */}
                <div className="absolute left-3 top-4 h-[52%] w-[70%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:left-6 sm:top-6">
                  <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                    <span className="text-[10px] tracking-widest text-neutral-500 sm:text-xs">DEAL BOARD</span>
                    <div className="flex items-center gap-1">
                      <div className="h-3 w-3 rounded-full bg-green-500/70" />
                      <span className="text-[10px] text-green-600">Active</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 p-2">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded bg-blue-500" />
                        <span className="text-neutral-700">Maya · 14 Oak St</span>
                      </div>
                      <span className="text-blue-600">Tour Sat 2:00</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded bg-green-400" />
                        <span className="text-neutral-700">Tom · refi question</span>
                      </div>
                      <span className="text-green-600">Replied</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] sm:text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded bg-yellow-500" />
                        <span className="text-neutral-700">Dana · browsing</span>
                      </div>
                      <span className="text-yellow-600">Follow-up set</span>
                    </div>
                  </div>
                </div>

                {/* Chippi log */}
                <div className="absolute right-4 top-5 h-[68%] w-[38%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:right-6 sm:top-7">
                  <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                    <span className="text-[10px] tracking-widest text-neutral-500 sm:text-xs">CHIPPI LOG</span>
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  </div>
                  <div className="space-y-2 p-2">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
                      <div className="min-w-0">
                        <div className="mb-0.5 text-[9px] text-neutral-500">Chippi</div>
                        <div className="rounded-lg bg-black/5 px-2 py-1 text-[9px] text-neutral-700">
                          Drafted 3 replies
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full bg-gradient-to-r from-green-400 to-green-600" />
                      <div className="min-w-0">
                        <div className="mb-0.5 text-[9px] text-neutral-500">You</div>
                        <div className="rounded-lg bg-black/5 px-2 py-1 text-[9px] text-neutral-700">
                          Approved · sent
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div className="absolute bottom-10 left-6 h-[28%] w-[55%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:bottom-12 sm:left-12">
                  <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                    <span className="text-[10px] tracking-widest text-neutral-500 sm:text-xs">TODAY</span>
                    <span className="text-[10px] text-green-600">78%</span>
                  </div>
                  <div className="p-2">
                    <div className="h-2 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#ff7a47] to-green-500"
                        style={{ width: '78%' }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] text-neutral-500">
                      <span>9 leads worked</span>
                      <span>2 awaiting approval</span>
                    </div>
                  </div>
                </div>

                {/* Team avatars */}
                <div className="absolute bottom-4 right-4 flex -space-x-1">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29] ring-2 ring-white" />
                  <div className="h-6 w-6 rounded-full bg-gradient-to-r from-green-400 to-green-600 ring-2 ring-white" />
                  <div className="h-6 w-6 rounded-full bg-gradient-to-r from-purple-400 to-purple-600 ring-2 ring-white" />
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 ring-2 ring-white">
                    <span className="text-[8px] text-neutral-700">+2</span>
                  </div>
                </div>
              </div>

              {/* Features grid */}
              <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Approval-first Drafts</h4>
                  <p className="mt-2 text-sm text-neutral-500">
                    Every reply waits for your tap. Edit, send, or skip, the
                    decision stays yours on every thread.
                  </p>
                </div>
                <div>
                  <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Pipeline Tracking</h4>
                  <p className="mt-2 text-sm text-neutral-500">
                    Deals advance themselves as things happen, with every move
                    logged in plain language.
                  </p>
                </div>
              </div>

              {/* CTA */}
              <div>
                <Link
                  href="/chippi"
                  className="inline-flex items-center gap-2 text-xs font-medium text-zinc-950 hover:text-neutral-600"
                >
                  See Chippi at work
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
