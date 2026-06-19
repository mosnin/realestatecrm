'use client';

/**
 * CommissionStatCell — the commissions stat strip cell, with the focal
 * numeral counting up on entry.
 *
 * Same paper-flat geometry and three-line layout as the server-rendered
 * StatCell it replaces (focal number → label → sub). The only change is the
 * number animates in via the shared AnimatedNumber (which honors
 * prefers-reduced-motion). Money is the loudest fact on this page; letting it
 * tick up makes the YTD figure something the realtor *watches* land.
 */

import { AnimatedNumber } from '@/components/motion/animated-number';
import { STAT_NUMBER_COMPACT, TITLE_FONT } from '@/lib/typography';

export function CommissionStatCell({
  value,
  format,
  label,
  sub,
}: {
  value: number;
  format: (n: number) => string;
  label: string;
  sub: string;
}) {
  return (
    <div className="bg-background p-5">
      <p className={STAT_NUMBER_COMPACT} style={TITLE_FONT}>
        <AnimatedNumber value={value} format={format} />
      </p>
      <p className="text-sm text-foreground mt-1.5">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
