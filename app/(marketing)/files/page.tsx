/**
 * `/files` — every document in one place, filed to the deal automatically.
 * Hero (mock file collage) + the gooey category tabs that showcase finding
 * anything in one search, then the ask.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from '@/components/marketing/site/reveal';
import { FilesHero } from '@/components/marketing/site/files/files-hero';
import { GooeyFiles } from '@/components/marketing/site/files/gooey-files';
import { TITLE_FONT } from '@/lib/typography';

export const metadata = {
  title: 'Files · Chippi',
  description:
    'Contracts, disclosures, listing photos, CMAs — Chippi files every document to the right deal automatically, so you find it in one search instead of digging through folders.',
};

export default function FilesPage() {
  return (
    <>
      <FilesHero />

      {/* Gooey showcase — find anything */}
      <section className="bg-background px-4 py-20 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Everything filed
            </p>
            <h2 style={TITLE_FONT} className="mt-3 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              Find any document in one search.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              Chippi sorts every file by deal, client, and type the moment it lands. No naming
              conventions, no nested folders — just ask, and it’s there.
            </p>
          </Reveal>
          <div className="mt-14">
            <GooeyFiles />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border/60 bg-muted/20 px-4 py-24 sm:px-6 sm:py-28">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
            Stop hunting for the contract.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Connect your email and drive — Chippi files what comes in, where it belongs.
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
