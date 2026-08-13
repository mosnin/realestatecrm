'use client';

import { createLibrary, createParser, defineComponent, Renderer } from '@openuidev/react-lang';
import { Database } from 'lucide-react';
import { useMemo } from 'react';
import { z } from 'zod';

const ChippiInsight = defineComponent({
  name: 'ChippiInsight',
  description: 'A read-only, source-labeled Chippi analysis with bounded metrics and notes.',
  props: z.object({
    title: z.string().max(120),
    summary: z.string().max(600),
    source: z.string().max(140),
    metrics: z.array(z.object({
      label: z.string().max(48),
      value: z.string().max(96),
      detail: z.string().max(140).optional(),
    }).strict()).max(6),
    notes: z.array(z.string().max(240)).max(6),
  }).strict(),
  component: ({ props }) => (
    <section className="overflow-hidden rounded-2xl border border-border/65 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none">
      <div className="border-b border-border/55 px-4 py-3.5">
        <h3 className="text-sm font-semibold leading-5 text-foreground">{props.title}</h3>
        <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">{props.summary}</p>
      </div>
      {props.metrics.length > 0 ? (
        <dl className="grid grid-cols-2 divide-x divide-y divide-border/45 sm:grid-cols-4">
          {props.metrics.map((metric, index) => (
            <div key={`${metric.label}-${index}`} className="min-w-0 px-3 py-3">
              <dt className="truncate text-[10px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
                {metric.label}
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground">
                {metric.value}
              </dd>
              {metric.detail ? (
                <dd className="mt-0.5 truncate text-[10px] text-muted-foreground">{metric.detail}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}
      {props.notes.length > 0 ? (
        <ul className="space-y-1 border-t border-border/55 px-4 py-3 text-[11px] leading-4 text-muted-foreground">
          {props.notes.map((note, index) => <li key={`${note}-${index}`}>• {note}</li>)}
        </ul>
      ) : null}
      <div className="flex items-center gap-1.5 border-t border-border/55 px-4 py-2 text-[10px] text-muted-foreground">
        <Database aria-hidden="true" className="size-3" />
        <span className="truncate">Source: {props.source}</span>
      </div>
    </section>
  ),
});

export const chippiOpenUiLibrary = createLibrary({
  components: [ChippiInsight],
  root: 'ChippiInsight',
});

export function validateChippiOpenUiProgram(program: string): boolean {
  if (!program || program.length > 12_000) return false;
  const result = createParser(chippiOpenUiLibrary.toJSONSchema()).parse(program);
  return Boolean(
    result.root &&
    !result.meta.incomplete &&
    result.meta.unresolved.length === 0 &&
    result.meta.errors.length === 0,
  );
}

/** Read-only OpenUI renderer: no actions, forms, queries, mutations, or shell. */
export function ChippiOpenUiRenderer({ program }: { program: string }) {
  const valid = useMemo(() => validateChippiOpenUiProgram(program), [program]);
  if (!valid) return null;

  return (
    <div data-openui-surface="chippi-insight" className="mt-2 w-full max-w-xl">
      <Renderer
        response={program}
        library={chippiOpenUiLibrary}
        isStreaming={false}
        toolProvider={null}
      />
    </div>
  );
}
