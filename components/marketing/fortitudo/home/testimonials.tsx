'use client';

/**
 * Testimonials: fortitudo's spotlight-card grid, carrying the same placeholder
 * voices already shipped on the Chippi home (owner-approved placeholders until
 * real quotes land). No invented metrics; calm, field-grounded framing.
 */

import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { SpotlightCard } from '../spotlight-card';

const testimonials = [
  {
    quote:
      'Chippi drafts the reply I was about to type, then waits for my tap. It feels like having an assistant who already knows my book.',
    name: 'Realtor name',
    role: 'Agent · City',
  },
  {
    quote:
      'I stopped losing leads in my inbox. Every morning the day is already triaged for me.',
    name: 'Realtor name',
    role: 'Agent · City',
  },
  {
    quote:
      'For the first time I can see what the whole floor is closing without nagging anyone for updates.',
    name: 'Broker name',
    role: 'Broker · Team of 12',
  },
  {
    quote:
      'The pipeline is finally honest. I move a card and everything else just updates.',
    name: 'Realtor name',
    role: 'Agent · City',
  },
];

export function Testimonials() {
  return (
    <section className="bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-brand text-xs uppercase tracking-[0.25em] text-brand">From the field</p>
          <h2 className="font-serif mt-3 text-4xl leading-[1.05] tracking-normal text-foreground sm:text-5xl lg:text-6xl">
            Loved by the people who <span className="italic text-gradient-brand">carry the deals.</span>
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2">
          {testimonials.map((t, index) => (
            <motion.div
              key={t.quote}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="h-full"
            >
              <SpotlightCard className="h-full p-6 sm:p-8">
                <div className="mb-4 flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-brand text-brand" />
                  ))}
                </div>
                <blockquote className="text-base leading-relaxed text-foreground/80">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-5 border-t border-border/60 pt-4">
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
