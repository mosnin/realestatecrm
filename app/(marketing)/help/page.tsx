/**
 * `/help`, the Help Center. Server component (exports metadata). Same cinematic
 * layout as the rest of the marketing redesign: the guides + the ChippiCircuit
 * wiring diagram live in a forced-dark wrapper (built for a dark canvas), and
 * the closing CTA stays light/dark-adaptive like the home page — so the logged-
 * out help destination reads as one brand with the storefront.
 */

import { HelpCenter } from '@/components/marketing/giga/help-center';
import { CtaSection } from '@/components/marketing/giga/cta';

export const metadata = {
  title: 'Help Center · Chippi',
  description:
    'Practical guides for every part of Chippi — from your first import to the automations that run your book while you close.',
};

export default function HelpCenterPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        <HelpCenter />
      </div>
      <CtaSection />
    </>
  );
}
