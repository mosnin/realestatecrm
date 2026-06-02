"use client";

/**
 * Chippi wordmark, drawn on. The Apple "hello" effect, rebuilt in Chippi's own
 * typeface: each letter of "chippi" is the outline of the brand serif
 * (Times New Roman / Liberation Serif, matching --font-title), traced
 * stroke-by-stroke via `pathLength`, then filled. Not a font render and not
 * hand-typed beziers — the paths were extracted from the actual brand font.
 *
 * Reusable: drop it anywhere, set `className` for size/color (it inherits
 * `currentColor`), `speed` to scale the timing, and `onAnimationComplete` to
 * chain whatever comes next (e.g. the splash fade).
 */

import type { Transition } from "motion/react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

// Per-letter outline paths for "chippi", extracted from Liberation Serif
// Regular (Times-metric, = --font-title). viewBox is the font's em box for the
// word; the rendered size comes from `className` height.
const GLYPHS: string[] = [
  "M846 1768Q797 1804 711.0 1824.5Q625 1845 535 1845Q78 1845 78 1348Q78 1113 194.5 986.5Q311 860 528 860Q663 860 823 891V1153H768L725 987Q642 940 526 940Q258 940 258 1348Q258 1560 339.5 1650.5Q421 1741 592 1741Q738 1741 846 1708Z",
  "M1235 811Q1235 915 1228 961Q1300 920 1391.5 890.0Q1483 860 1546 860Q1668 860 1730.0 931.0Q1792 1002 1792 1137V1755L1906 1780V1825H1501V1780L1626 1755V1149Q1626 977 1460 977Q1366 977 1235 1006V1755L1362 1780V1825H950V1780L1069 1755V473L929 449V404H1235Z",
  "M2312 578Q2312 622 2280.0 654.0Q2248 686 2203 686Q2159 686 2127.0 654.0Q2095 622 2095 578Q2095 533 2127.0 501.0Q2159 469 2203 469Q2248 469 2280.0 501.0Q2312 533 2312 578ZM2302 1755 2463 1780V1825H1976V1780L2136 1755V955L2003 930V885H2302Z",
  "M2654 955 2547 930V885H2811L2813 940Q2855 904 2925.5 882.0Q2996 860 3069 860Q3249 860 3347.5 985.0Q3446 1110 3446 1344Q3446 1583 3338.5 1714.0Q3231 1845 3028 1845Q2915 1845 2813 1823Q2819 1895 2819 1936V2190L2983 2214V2261H2535V2214L2654 2190ZM3266 1344Q3266 1152 3203.5 1058.5Q3141 965 3014 965Q2897 965 2819 998V1749Q2908 1766 3014 1766Q3266 1766 3266 1344Z",
  "M3678 955 3571 930V885H3835L3837 940Q3879 904 3949.5 882.0Q4020 860 4093 860Q4273 860 4371.5 985.0Q4470 1110 4470 1344Q4470 1583 4362.5 1714.0Q4255 1845 4052 1845Q3939 1845 3837 1823Q3843 1895 3843 1936V2190L4007 2214V2261H3559V2214L3678 2190ZM4290 1344Q4290 1152 4227.5 1058.5Q4165 965 4038 965Q3921 965 3843 998V1749Q3932 1766 4038 1766Q4290 1766 4290 1344Z",
  "M4929 578Q4929 622 4897.0 654.0Q4865 686 4820 686Q4776 686 4744.0 654.0Q4712 622 4712 578Q4712 533 4744.0 501.0Q4776 469 4820 469Q4865 469 4897.0 501.0Q4929 533 4929 578ZM4919 1755 5080 1780V1825H4593V1780L4753 1755V955L4620 930V885H4919Z",
];

const VIEW_BOX = "38 364 5082 1937";

type Props = React.ComponentProps<typeof motion.svg> & {
  /** Scales every duration/delay. 1 = ~3s draw. Higher = slower. */
  speed?: number;
  onAnimationComplete?: () => void;
};

export function ChippiHelloEffect({
  className,
  speed = 1,
  onAnimationComplete,
  ...props
}: Props) {
  const calc = (x: number) => x * speed;
  const stagger = calc(0.5);
  const draw = calc(0.9);

  return (
    <motion.svg
      className={cn("h-20", className)}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEW_BOX}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={18}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      {...props}
    >
      <title>chippi</title>
      {GLYPHS.map((d, i) => {
        const start = i * stagger;
        const transition: Transition = {
          pathLength: { duration: draw, ease: "easeInOut", delay: start },
          opacity: { duration: 0.2, delay: start },
          // Fill flows in once the outline is most of the way drawn.
          fillOpacity: { duration: 0.45, delay: start + draw * 0.55 },
        };
        return (
          <motion.path
            key={i}
            d={d}
            style={{ strokeLinejoin: "round", strokeLinecap: "round" }}
            initial={{ pathLength: 0, opacity: 0, fillOpacity: 0 }}
            animate={{ pathLength: 1, opacity: 1, fillOpacity: 1 }}
            transition={transition}
            onAnimationComplete={
              i === GLYPHS.length - 1 ? onAnimationComplete : undefined
            }
          />
        );
      })}
    </motion.svg>
  );
}
