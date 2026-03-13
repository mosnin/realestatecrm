"use client";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import React from "react";
import { cn } from "@/lib/utils";

const candyBgStyle = `
.stats-candy-bg {
  background-color: hsl(var(--muted));
  background-image: linear-gradient(
    135deg,
    hsl(var(--muted-foreground) / 0.06) 25%,
    transparent 25.5%,
    transparent 50%,
    hsl(var(--muted-foreground) / 0.06) 50.5%,
    hsl(var(--muted-foreground) / 0.06) 75%,
    transparent 75.5%,
    transparent
  );
  background-size: 10px 10px;
}`;

const bars = [
  { value: 34, label: "Manual DMs",     delay: 0.2 },
  { value: 28, label: "Listing forms",  delay: 0.4 },
  { value: 91, label: "Chippi",         highlight: true, delay: 0.6 },
  { value: 41, label: "Spreadsheets",   delay: 0.8 },
];

export function Stats() {
  return (
    <section id="problem" className="py-20 px-6 border-t border-border">
      <style>{candyBgStyle}</style>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-14 grid md:grid-cols-2 gap-6 items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">The problem</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight leading-tight">
              Leasing inquiries move fast.<br />Most workflows&nbsp;don&apos;t.
            </h2>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              Leads arrive through DMs, listing sites, texts, and forms. Important
              context gets lost, follow-up order gets fuzzy, and every day starts
              with cleanup.
            </p>
            <p>
              Chippi gives you one clean intake path and one command center so you
              can act faster with less manual chaos.
            </p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="relative mx-auto flex h-80 max-w-3xl items-end justify-center gap-3">
          {bars.map((bar, i) => (
            <motion.div
              key={bar.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.15, type: "spring", damping: 12 }}
              className="h-full w-full"
            >
              <BarChart {...bar} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BarChart({
  value,
  label,
  highlight = false,
  delay = 0,
}: {
  value: number;
  label: string;
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <div className="group relative h-full w-full">
      <div className="stats-candy-bg relative h-full w-full overflow-hidden rounded-3xl border border-border">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: `${value}%` }}
          transition={{ duration: 0.6, type: "spring", damping: 18, delay }}
          className={cn(
            "absolute bottom-0 w-full rounded-3xl p-3",
            highlight
              ? "bg-primary text-primary-foreground"
              : "bg-muted-foreground/20 text-foreground"
          )}
        >
          <div className="relative flex h-12 w-full items-center justify-center gap-1 rounded-full bg-background/15 text-sm font-semibold tabular-nums tracking-tight">
            <NumberFlow value={value} suffix="%" />
          </div>
        </motion.div>
      </div>

      {/* Tooltip shown only on highlight bar */}
      {highlight && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: delay + 0.3 }}
          className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-md"
        >
          Best conversion rate
          {/* Arrow */}
          <svg
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 text-primary"
            width="10" height="7" viewBox="0 0 10 7" fill="none"
          >
            <path d="M3.84 6.41C4.44 7.45 5.94 7.45 6.54 6.41L9.66 1.01C10.26 -0.03 9.51 -1.32 8.31 -1.32H2.07C0.87 -1.32 0.12 -0.03 0.72 1.01L3.84 6.41Z" fill="currentColor" />
          </svg>
        </motion.div>
      )}

      <p className="mx-auto mt-2.5 w-fit text-center text-xs text-muted-foreground/80 tracking-tight">
        {label}
      </p>
    </div>
  );
}
