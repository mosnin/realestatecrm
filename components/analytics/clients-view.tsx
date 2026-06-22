'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import {
  StatCell,
  StatStrip,
  ChartSection,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  PAPER_SERIES,
  PAPER_GRID,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { ClientsAnalyticsData } from '@/lib/analytics-data';
import {
  SECTION_RHYTHM,
  STAT_NUMBER,
  TITLE_FONT,
  CAPTION,
  H3,
} from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion/animated-number';

const contactsOverTimeConfig = {
  count: { label: 'Contacts', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const contactsByStageConfig = {
  count: { label: 'Contacts', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const STAGE_FILLS: Record<string, string> = {
  Qualifying: 'hsl(var(--muted-foreground) / 0.5)',
  Tour: 'hsl(var(--foreground) / 0.7)',
  Applied: 'hsl(var(--foreground))',
};

export function ClientsView({ data }: { data: ClientsAnalyticsData }) {
  const reduce = useReducedMotion();
  // Build a stat strip — total + each stage + conversion. Total cells = 2 + stages.
  const stageCells = data.contactsByStage.slice(0, 2); // cap to keep the strip tidy at 4 cols
  return (
    <div className={SECTION_RHYTHM}>
      {/* Summary strip */}
      <StatStrip>
        <StatCell label="Total contacts" value={data.totalContacts} sub="in your book" />
        {stageCells.map((s) => (
          <StatCell key={s.label} label={s.label} value={s.count} />
        ))}
        <StatCell
          label="Lead-to-client"
          value={data.leadToClientRate > 0 ? `${data.leadToClientRate}%` : '--'}
          sub={`from ${data.totalLeads} leads`}
        />
      </StatStrip>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Contacts over time" sub="New contacts added each month" index={0}>
          <ChartContainer config={contactsOverTimeConfig} className="h-[220px] w-full">
            <AreaChart data={data.contactsOverTime}>
              <defs>
                <linearGradient id="contactsGradClients" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                fill="url(#contactsGradClients)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Contacts by stage" sub="Current distribution across stages" index={1}>
          <ChartContainer config={contactsByStageConfig} className="h-[220px] w-full">
            <BarChart data={data.contactsByStage} barSize={32}>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {data.contactsByStage.map((entry, i) => (
                  <Cell
                    key={entry.label}
                    fill={STAGE_FILLS[entry.label] ?? PAPER_SERIES[i % PAPER_SERIES.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>

      {/* Conversion funnel — paper-flat, hairline boxes with serif numbers */}
      <ChartSection title="Client pipeline funnel" sub="Conversion rates across your renter pipeline" index={2}>
        <div className="flex flex-col sm:flex-row gap-4 items-stretch py-2">
          {data.contactFunnel.map((stage, i) => {
            const opacity = 1 - i * 0.15;
            return (
              <motion.div
                key={stage.label}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: DURATION_BASE,
                  ease: EASE_OUT,
                  delay: reduce ? 0 : 0.1 + Math.min(i, 4) * 0.06,
                }}
                className="flex-1 rounded-xl border border-border/70 bg-background px-5 py-4 flex sm:flex-col items-center sm:items-start gap-3 sm:gap-1 transition-colors duration-200 hover:border-border"
              >
                <p
                  className={STAT_NUMBER}
                  style={{ ...TITLE_FONT, opacity }}
                >
                  <AnimatedNumber value={stage.count} />
                </p>
                <div className="flex flex-col">
                  <p className={H3}>{stage.label}</p>
                  {i > 0 && (
                    <p className={CAPTION}>
                      {stage.rate}% conversion
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </ChartSection>
    </div>
  );
}
