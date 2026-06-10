/**
 * Founders — the two-up section on the calm site system. Each founder gets a
 * square headshot slot (labeled ImagePlaceholder — the owner swaps real media
 * in), a name, a role, and a short bio. No fabricated photo files.
 */

import { Reveal } from '@/components/marketing/site/reveal';
import { ImagePlaceholder } from '@/components/marketing/site/frame';

const FOUNDERS = [
  {
    name: 'Orlando',
    role: 'Co-founder',
    bio: 'Spent a decade in the short-term rental space, running into the same wall: real-estate software and the workflows around it were built for a pre-AI world. The productivity that’s possible now isn’t the productivity agents actually get.',
  },
  {
    name: 'Preston',
    role: 'Co-founder',
    bio: 'A decade building in e-commerce, software, and technology. Recently built groundbreaking AI agent-orchestration frameworks alongside several products of his own — the machinery that lets an agent do real work, not just answer questions.',
  },
];

export function Founders() {
  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-12">
      {FOUNDERS.map((f, i) => (
        <Reveal key={f.name} delay={i * 0.06}>
          <div className="overflow-hidden rounded-xl border border-border/70">
            <ImagePlaceholder label={f.name} sublabel="Headshot · square" ratio="aspect-square" />
          </div>
          <h3 className="mt-6 text-[22px] font-semibold tracking-tight text-foreground">{f.name}</h3>
          <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {f.role}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{f.bio}</p>
        </Reveal>
      ))}
    </div>
  );
}
