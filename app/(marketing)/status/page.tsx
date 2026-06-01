/**
 * `/status` — system status. Honest, calm, no theatre.
 *
 * Apple-discipline: a silent serif hero, then a hairline-divided list of the
 * surfaces a realtor depends on, each carrying the same emerald dot the
 * footer uses. Every component reads "Operational" because that is the
 * truth right now — we do NOT invent an incident history or a fake uptime
 * percentage. Those would be unverifiable claims, and a status page that
 * lies is worse than no status page. When there is a real incident feed to
 * wire, it earns its place here; until then the page stays a calm fact.
 *
 * No charts, no graphs, no numbers. Hairline borders only. No brand orange.
 */

import { MarketingHero } from '@/components/marketing/marketing-hero';

export const metadata = { title: 'Status — Chippi' };

/** The surfaces a realtor depends on. All operational — see the note above
 *  about why there are no fabricated metrics. */
const COMPONENTS: string[] = [
  'Agent (Chippi)',
  'Dashboard',
  'Email + calendar sync',
  'Studio',
  'Intake forms',
];

function StatusRow({ label }: { label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-4">
      <span className="text-sm text-foreground">{label}</span>
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <span
          aria-hidden
          className="inline-block size-2 rounded-full bg-emerald-500"
        />
        Operational
      </span>
    </li>
  );
}

export default function StatusPage() {
  return (
    <>
      <MarketingHero
        eyebrow="STATUS"
        title="All systems operational."
        sub="Live status of Chippi’s agent, integrations, and dashboard."
      />

      <section className="relative pb-24 md:pb-32">
        <div className="mx-auto max-w-2xl px-6 md:px-8">
          <ul className="divide-y divide-border/60 border-t border-b border-border/60">
            {COMPONENTS.map((label) => (
              <StatusRow key={label} label={label} />
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            Subscribe to status updates —{' '}
            <a
              href="mailto:status@chippi.app"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              status@chippi.app
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
