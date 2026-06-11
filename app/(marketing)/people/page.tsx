/**
 * `/people` — every lead and client in one place, scored and followed up.
 * Hero (PageHero, consistent with the other sub-pages) → the provided
 * CustomersTableCard as the "how people are managed" centerpiece → how-it-works
 * feature cards → CTA. Headshots are stock stand-ins until real imagery lands.
 */

import Link from 'next/link';
import { ArrowRight, Flame, Bell, History, Users } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import CustomersTableCard, { type Customer } from '@/components/ui/customers-table-card';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'People · Chippi',
  description:
    'Every lead and client in one place — scored the moment they land, followed up automatically, with every touch on one timeline. Chippi keeps the relationships warm so nothing goes cold.',
};

const CLIENTS: Customer[] = [
  { id: 1, date: '2h ago', status: 'Active', statusVariant: 'warning', name: 'Maya Patel · buyer', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=64&h=64&fit=crop&crop=faces&q=80', revenue: '$1,200,000' },
  { id: 2, date: '5h ago', status: 'Active', statusVariant: 'warning', name: 'Sara Voss · seller', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=64&h=64&fit=crop&crop=faces&q=80', revenue: '$2,400,000' },
  { id: 3, date: '1d ago', status: 'Closed', statusVariant: 'success', name: 'Bernard Ng', avatar: 'https://avatars.githubusercontent.com/u/31113941?v=4', revenue: '$890,000' },
  { id: 4, date: '2d ago', status: 'Active', statusVariant: 'warning', name: 'Eli Vance · buyer', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&crop=faces&q=80', revenue: '$815,000' },
  { id: 5, date: '6d ago', status: 'Lost', statusVariant: 'danger', name: 'Dana Lee', avatar: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=64&h=64&fit=crop&crop=faces&q=80', revenue: '$640,000' },
];

const FEATURES = [
  { Icon: Flame, title: 'Scored on arrival', body: 'Every new lead lands with a tier and a reason — hot, warm, cold — weighed against your live deals, so you call the right one first.' },
  { Icon: Bell, title: 'Followed up, automatically', body: 'Chippi watches for the leads going quiet and drafts the nudge before they cool. Nothing slips while you’re showing houses.' },
  { Icon: History, title: 'One timeline per person', body: 'Every email, text, tour, and note in one place. Open a contact and see the whole relationship — not five scattered tools.' },
];

export default function PeoplePage() {
  return (
    <>
      <PageHero
        eyebrow="People"
        title="Every lead, in one place."
        sub="Chippi scores each person the moment they land, keeps the follow-ups moving, and puts every touch on one timeline — so no relationship goes cold while you’re in the field."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Watch demo', href: '/demo' }}
      />

      {/* The table — the provided component, tailored to Chippi */}
      <section className="bg-background px-4 pb-8 sm:px-6">
        <Reveal className="mx-auto max-w-4xl">
          <div className="rounded-3xl bg-foreground/5 p-3 sm:p-6">
            <CustomersTableCard
              title="Your book of business"
              subtitle="Leads to closings, ranked by what needs you next."
              customers={CLIENTS}
            />
          </div>
        </Reveal>
      </section>

      {/* How people are managed */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">How people are managed</p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              The relationship, kept warm.
            </h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-2xl border border-border/60 bg-border/60 md:grid-cols-3">
            {FEATURES.map((f) => (
              <Reveal key={f.title}>
                <div className="h-full bg-background p-7">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-brand-subtle text-brand">
                    <f.Icon className="h-4 w-4" />
                  </span>
                  <h3 className="mt-4 text-[17px] font-semibold leading-snug text-foreground">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-subtle text-brand">
            <Users className="h-5 w-5" />
          </span>
          <h2 style={TITLE_FONT} className="mx-auto mt-5 max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Never let a good lead go cold.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Connect your inbox and Chippi starts scoring and following up from day one.
          </p>
          <div className="mt-8">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
