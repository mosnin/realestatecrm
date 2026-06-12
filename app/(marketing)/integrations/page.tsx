/**
 * `/integrations` — every app Chippi can work inside, through Composio.
 *
 * One idea: connect the tools you already pay for, and Chippi calls each one
 * as a tool while it works — pulling data out of your workflows and writing
 * results back where they belong.
 *
 * The owner-provided IntegrationHero opens the page. Below it we add two new
 * beats on the white + pastel system — a category FeatureGrid (lucide icon in
 * a tinted circle per category, with example tools) and a "connect in two
 * minutes" three-step section — then the existing
 * `components/marketing/integrations/integrations-page.tsx` body, whose catalog
 * renders straight from `lib/integrations/catalog.ts` (the source of truth).
 * We don't invent integrations or blurbs here; the page is a faithful surface
 * over that data. Honest counts: 50+ apps, two minutes to connect.
 */

import type { LucideIcon } from 'lucide-react';
import {
  CalendarCheck,
  FolderOpen,
  Link2,
  Mail,
  MessageSquare,
  PenLine,
  PlugZap,
  ShieldCheck,
  Users,
} from 'lucide-react';
import IntegrationHero from '@/components/ui/integration-hero';
import { IntegrationsPage } from '@/components/marketing/integrations/integrations-page';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';

export const metadata = {
  title: 'Integrations · Chippi',
  description:
    'Connect the tools you already use. Chippi connects through Composio, then calls each one as a tool while it works, pulling data from and pushing data into your existing workflows.',
};

/* Categories — the shape of the catalog, one card each. Example tools are
 * drawn straight from lib/integrations/catalog.ts so nothing is invented. */
const CATEGORIES: { icon: LucideIcon; title: string; body: string; tools: string }[] = [
  {
    icon: Users,
    title: 'CRMs',
    body: 'Mirror deals and contacts to the system your brokerage already runs on.',
    tools: 'HubSpot · Salesforce · Pipedrive · Zoho',
  },
  {
    icon: Mail,
    title: 'Email',
    body: 'Chippi reads inbound, drafts the reply, and works your nurture lists.',
    tools: 'Gmail · Outlook · Mailchimp',
  },
  {
    icon: CalendarCheck,
    title: 'Calendar',
    body: 'Tour times proposed against your real availability, invites sent on approval.',
    tools: 'Google Calendar · Outlook · Calendly',
  },
  {
    icon: PenLine,
    title: 'E-sign',
    body: 'Send contracts and disclosures for signature without leaving the deal.',
    tools: 'DocuSign · Dropbox Sign',
  },
  {
    icon: MessageSquare,
    title: 'Comms',
    body: 'SMS, WhatsApp, and team chat threaded onto the deal they belong to.',
    tools: 'Twilio · WhatsApp · Slack',
  },
  {
    icon: FolderOpen,
    title: 'Drive',
    body: 'Pull listing photos and disclosures Chippi can attach to a draft.',
    tools: 'Google Drive · OneDrive · Dropbox',
  },
];

/* Connect in two minutes — HowItWorks-style white shadow steps with
 * tinted-circle icons. */
const CONNECT_STEPS: { n: string; icon: LucideIcon; title: string; body: string }[] = [
  {
    n: '01',
    icon: Link2,
    title: 'Pick your apps',
    body: 'Choose the tools you already work in. Chippi connects through Composio over OAuth — no keys to copy, no scripts to wire.',
  },
  {
    n: '02',
    icon: PlugZap,
    title: 'Authorize in two minutes',
    body: 'Tap connect and sign in once per app. Each one becomes a tool Chippi can call mid-task, on its own.',
  },
  {
    n: '03',
    icon: ShieldCheck,
    title: 'Data flows both ways',
    body: 'Chippi pulls what it needs and writes results back where the work lives. Anything that posts or sends waits for your tap.',
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      <span aria-hidden className="text-[#ff4b29]">
        ✦
      </span>
      {children}
    </p>
  );
}

export default function Page() {
  return (
    <>
      <IntegrationHero />

      {/* Categories — tinted-circle icon cards, one per shape of the catalog */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <Eyebrow>Every category</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            The whole stack a realtor runs on.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            50+ apps across the categories that matter — connect the ones you
            already pay for and Chippi reaches for each as it works.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <StaggerItem key={cat.title} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <cat.icon className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {cat.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{cat.body}</p>
                <p className="mt-5 border-t border-neutral-100 pt-4 text-sm font-medium text-neutral-500">
                  {cat.tools}
                </p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Connect in two minutes — white shadow steps, tinted-circle icons */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <Eyebrow>Two minutes to connect</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Connected before your coffee&apos;s cold.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            No migration, no integration project. Authorize over OAuth and
            Chippi starts reaching for the tool the moment it needs it.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
          {CONNECT_STEPS.map(({ n, icon: Icon, title, body }) => (
            <StaggerItem key={n} className="h-full">
              <div className="flex h-full flex-col rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Icon className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <span className="text-sm font-semibold tracking-[0.14em] text-[#ff4b29]">{n}</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <IntegrationsPage />
    </>
  );
}
