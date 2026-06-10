/**
 * Integration logo strip — the "works with your stack" band, right under the
 * hero. This is the honest version of an enterprise logo wall: instead of
 * fabricating customer logos (the same sin as the fake testimonials we just
 * deleted), it shows the tools Chippi genuinely connects to, as labeled slots
 * the owner drops real brand logos into.
 */

import { Reveal } from '../reveal';

const integrations = ['Gmail', 'Outlook', 'Google Calendar', 'WhatsApp', 'Slack', 'HubSpot'];

export function Logos() {
  return (
    <section className="border-b border-border/60 bg-background px-4 py-12 sm:px-6">
      <Reveal className="mx-auto max-w-5xl">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Connects with the tools you already use
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {integrations.map((name) => (
            <div
              key={name}
              className="flex h-14 items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/50 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
            >
              {/* slot for the real brand logo */}
              <span aria-hidden className="h-5 w-5 rounded-md bg-foreground/[0.06]" />
              {name}
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          …and <span className="text-foreground">50+ more</span> — two minutes to connect, no migration.
        </p>
      </Reveal>
    </section>
  );
}
