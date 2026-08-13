export interface ChippiInsightMetric {
  label: string;
  value: string;
  detail?: string;
}

export interface ChippiInsightProgramInput {
  title: string;
  summary: string;
  source: string;
  metrics: ChippiInsightMetric[];
  notes?: string[];
}

const clean = (value: string, max: number) => value.trim().slice(0, max);

/** Build trusted, read-only OpenUI Lang from tool-authored values. */
export function buildChippiInsightProgram(input: ChippiInsightProgramInput): string {
  const title = clean(input.title, 120);
  const summary = clean(input.summary, 600);
  const source = clean(input.source, 140);
  const metrics = input.metrics.slice(0, 6).map((metric) => ({
    label: clean(metric.label, 48),
    value: clean(metric.value, 96),
    ...(metric.detail ? { detail: clean(metric.detail, 140) } : {}),
  }));
  const notes = (input.notes ?? []).slice(0, 6).map((note) => clean(note, 240));

  return `root = ChippiInsight(${JSON.stringify(title)}, ${JSON.stringify(summary)}, ${JSON.stringify(source)}, ${JSON.stringify(metrics)}, ${JSON.stringify(notes)})`;
}
