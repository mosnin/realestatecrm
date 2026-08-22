'use client';

/**
 * IntegrationsShowcase, the integrations feature section (image on the RIGHT).
 * Same animated/frosted pattern, grounded in the real apps Chippi connects to
 * through Composio: inbox, calendar, CRM, and messaging.
 */

import {
  Blocks,
  Boxes,
  ArrowLeftRight,
  Gauge,
  Mail,
  CalendarCheck,
  Database,
  MessageSquare,
  FileSignature,
  Check,
} from 'lucide-react';
import { FeatureShowcase, Frost, Row, type ShowcaseStep } from './feature-showcase';

const TOP_FEATURES = [
  { icon: Boxes, title: 'Your stack', desc: 'The tools you already pay for, connected through Composio.' },
  { icon: ArrowLeftRight, title: 'Two-way sync', desc: 'Chippi reads from and writes back to each tool as it works.' },
  { icon: Gauge, title: 'Two-minute setup', desc: 'Connect with a click; no engineering, no spreadsheets.' },
];

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

const ON = <Chip label="Connected" tone="bg-emerald-400/15 text-emerald-300" />;

const STEPS: ShowcaseStep[] = [
  {
    key: 'inbox',
    title: 'Your inbox',
    desc: 'Connect Gmail or Outlook and Chippi reads every inbound, sorts it against your deals, and drafts the reply in your voice.',
    mockup: (
      <Frost title="Inbox" badge="Connected">
        <Row icon={Mail} title="Gmail" meta="reading + drafting" tone="text-[#ff9a6e]" right={ON} active />
        <Row icon={Mail} title="Outlook" meta="reading + drafting" right={ON} />
        <Row icon={Check} title="Replies sent in your voice" meta="the moment a lead lands" tone="text-emerald-300/80" />
      </Frost>
    ),
  },
  {
    key: 'calendar',
    title: 'Your calendar',
    desc: 'Link Google Calendar or Calendly and tours book against your real availability, with confirmations sent automatically.',
    mockup: (
      <Frost title="Calendar" badge="Connected">
        <Row icon={CalendarCheck} title="Google Calendar" meta="availability + booking" tone="text-[#ff9a6e]" right={ON} active />
        <Row icon={CalendarCheck} title="Calendly" meta="self-scheduling links" right={ON} />
        <Row icon={Check} title="Tours booked, confirmations sent" meta="thread + deal updated" tone="text-emerald-300/80" />
      </Frost>
    ),
  },
  {
    key: 'crm',
    title: 'Your CRM',
    desc: 'Keep your CRM as the system of record. Chippi syncs contacts, deals, and notes both ways, so nothing falls out of date.',
    mockup: (
      <Frost title="CRM sync" badge="Two-way">
        <Row icon={Database} title="HubSpot" meta="contacts + deals" tone="text-[#ff9a6e]" right={ON} active />
        <Row icon={Database} title="Salesforce" meta="contacts + deals" right={ON} />
        <Row icon={Database} title="Follow Up Boss" meta="leads + stages" right={ON} />
      </Frost>
    ),
  },
  {
    key: 'messaging',
    title: 'Every channel',
    desc: 'Reach clients where they already are. Chippi sends and follows up over text and WhatsApp, in your voice, around the clock.',
    mockup: (
      <Frost title="Messaging" badge="Connected">
        <Row icon={MessageSquare} title="WhatsApp" meta="send + follow up" tone="text-[#ff9a6e]" right={ON} active />
        <Row icon={MessageSquare} title="WhatsApp" meta="send + follow up" right={ON} />
        <Row icon={Check} title="One worked queue" meta="email, text, and chat together" tone="text-emerald-300/80" />
      </Frost>
    ),
  },
  {
    key: 'docs',
    title: 'Documents on the deal',
    desc: 'Store the paperwork on the deal. If you connect your own DocuSign, you can send from that account — Chippi does not certify the signature or move the pipeline.',
    mockup: (
      <Frost title="Documents" badge="On the deal">
        <Row icon={FileSignature} title="Purchase agreement" meta="stored on the deal" tone="text-[#ff9a6e]" right={ON} active />
        <Row icon={Check} title="Your DocuSign, if you use it" meta="optional — you own the signature" tone="text-emerald-300/80" />
        <Row icon={Check} title="Accept the offer when you are ready" meta="realtor-owned contract date" tone="text-emerald-300/80" />
      </Frost>
    ),
  },
];

export function IntegrationsShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Integrations"
      headline={
        <>
          Connect the tools
          <br className="hidden sm:block" /> you already pay for.
        </>
      }
      product={{
        name: 'Connected',
        icon: Blocks,
        desc: 'Chippi plugs into your inbox, calendar, CRM, and messaging through Composio, then works inside them, no rip and replace.',
        cta: { label: 'Browse integrations', href: '/integrations' },
      }}
      topFeatures={TOP_FEATURES}
      steps={STEPS}
      image="/marketing/integrations-1.jpg"
      imageSide="right"
    />
  );
}
