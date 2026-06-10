/**
 * Metrics — one inverse band for contrast and gravitas.
 *
 * Deep-neutral band (the product's black stats-card pattern, scaled up) that
 * breaks the all-light rhythm once. The figures are capability statements, not
 * fabricated adoption metrics — we never invented a user count or a revenue
 * lift, and we don't here either.
 */

import { Reveal } from '../reveal';
import { TITLE_FONT } from '@/lib/typography';

const stats = [
  { value: '24/7', label: 'Always watching the inbox' },
  { value: 'Every lead', label: 'Scored the moment it lands' },
  { value: '6 → 1', label: 'Tools replaced by one workspace' },
  { value: '1 tap', label: 'Between a draft and a send' },
];

export function Metrics() {
  return (
    <section className="bg-background px-4 py-20 sm:px-6">
      <Reveal className="mx-auto max-w-5xl">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-marketing-2xl bg-white/10 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-[#111113] px-6 py-10 text-center">
              <p
                className="text-3xl tracking-tight text-white sm:text-[2.25rem]"
                style={TITLE_FONT}
              >
                {s.value}
              </p>
              <p className="mt-2 text-sm text-white/55">{s.label}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
