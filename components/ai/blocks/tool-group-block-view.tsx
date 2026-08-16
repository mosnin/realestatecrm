'use client';

/**
 * ToolGroupBlockView — one collapsed dropdown for every non-subagent tool
 * in a turn. Retries of the same tool collapse to a single nested row.
 * Successful rich cards still render below the header; failed lookups do
 * not advertise JSON / schema errors in the transcript.
 */

import { useMemo, type ReactNode } from 'react';
import { countLabel } from '@/lib/formatting';
import { ToolGroup, type NestedTool, type NestedToolCategory, type ToolGroupState } from '@/components/ui/tool-group';
import { Steps } from '@/components/ai/prompt-kit';
import type { ToolCallBlock } from '@/lib/ai-tools/blocks';
import { ToursResult } from './tool-results/tours-result';
import { AvailabilityPickerCard } from './tool-results/availability-picker-card';
import { ContactsTableResult } from './tool-results/contacts-table-result';
import { DealsTableResult } from './tool-results/deals-table-result';
import { PropertiesCarouselResult } from './tool-results/properties-carousel-result';
import { StatsResult } from './tool-results/stats-result';
import { WeatherResult } from './tool-results/weather-result';
import { AreaResult } from './tool-results/area-result';
import { OptionListResult } from './tool-results/option-list-result';
import { QuestionFlowResult } from './tool-results/question-flow-result';
import { MessageDraftResult, type MessageDraftData } from './tool-results/message-draft-result';
import { GeneratedImageResult } from './tool-results/generated-image-result';
import { ChippiOpenUiRenderer } from '@/components/ai/openui/chippi-openui-renderer';
import type { OptionListInput, QuestionFlowInput } from './tool-results/tool-ui-mappers';
import { normalizeDealRows, normalizePropertyRows } from './tool-results/normalize';
import { Table2 } from 'lucide-react';

/** snake_case → "Search contacts". Repeated from tool-call-block-view to keep
 *  these two surfaces independent — the inline view may diverge later. */
function friendlyName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Read-only verbs (search/find/get/recall/check/pipeline/analyze) map to
 *  the search icon; everything else is an action → command icon. `file` is
 *  reserved for note reads where "file" reads more naturally than "search". */
function categorizeToolName(name: string): NestedToolCategory {
  if (/^(get_note|read_)/.test(name)) return 'file';
  if (
    /^(search|find|get|recall|check|pipeline|analyze|list)_/.test(name) ||
    name === 'pipeline_summary' ||
    name === 'find_overdue_followups' ||
    name === 'find_quiet_hot_persons' ||
    name === 'find_stuck_deals'
  ) {
    return 'search';
  }
  return 'command';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Short prose subtitle derived from args. UUID fields are skipped — they
 *  mean nothing to a realtor. */
function argsSubtitle(args: Record<string, unknown> | undefined | null): string | undefined {
  if (!args) return undefined;
  const isUUID = (v: unknown): boolean => typeof v === 'string' && UUID_RE.test(v);

  if (typeof args.name === 'string' && args.name && !isUUID(args.name)) return args.name;
  if (typeof args.query === 'string' && args.query) return args.query;
  if (typeof args.subject === 'string' && args.subject) return args.subject;
  if (typeof args.stage === 'string' && args.stage) return `→ ${args.stage}`;

  const SKIP_KEYS = new Set(['contactId', 'dealId', 'tourId', 'propertyId', 'id']);
  const meaningful = Object.entries(args).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && !isUUID(v) && typeof v !== 'object',
  );
  if (meaningful.length === 0) return undefined;

  const [, val] = meaningful[0];
  if (typeof val === 'string' && val) return val.length > 60 ? `${val.slice(0, 57)}…` : val;
  if (typeof val === 'number') return String(val);
  return undefined;
}

function toNestedTool(block: ToolCallBlock): NestedTool {
  return {
    category: categorizeToolName(block.name),
    title: friendlyName(block.name),
    subtitle: argsSubtitle(block.args),
    isError: block.status === 'error',
  };
}

/** Latest attempt per tool name — retries of the same lookup collapse. */
export function uniqueToolBlocks(blocks: ToolCallBlock[]): ToolCallBlock[] {
  const latest = new Map<string, ToolCallBlock>();
  for (const block of blocks) {
    latest.set(block.name, block);
  }
  return [...latest.values()];
}

export function toolGroupViewState(
  blocks: ToolCallBlock[],
  anyLive: boolean,
): ToolGroupState {
  if (anyLive) return 'pending';
  const completed = blocks.filter((block) => block.status === 'complete');
  if (completed.length === 0) return 'interrupted';
  return 'completed';
}

export function toolGroupOutcomeLabel(blocks: ToolCallBlock[]): string {
  const unique = uniqueToolBlocks(blocks);
  const completed = unique.filter((block) => block.status === 'complete');
  const skipped = unique.filter(
    (block) => block.status === 'denied' || block.status === 'skipped',
  );

  if (completed.length > 0) {
    return countLabel(completed.length, 'call');
  }
  if (skipped.length > 0) {
    return `${countLabel(skipped.length, 'call')} skipped`;
  }
  return countLabel(unique.length || blocks.length, 'call');
}

/** Inline rich card for completed tools that returned a known data shape.
 *  Same switch as tool-call-block-view — duplicated rather than re-exported
 *  to keep the two views structurally independent. */
function richResultFor(
  block: ToolCallBlock,
  onUserIntent?: (text: string) => void,
  onOpenWorkbench?: (artifactId: string) => void,
): ReactNode {
  if (block.status !== 'complete' || !block.result?.ok) return null;
  const data = block.result.data as Record<string, unknown> | undefined;
  if (!data) return null;
  if (block.display === 'openui' && typeof data.program === 'string') {
    return <ChippiOpenUiRenderer program={data.program} />;
  }
  if (
    block.display === 'workbench'
    && typeof data.artifactId === 'string'
    && onOpenWorkbench
  ) {
    return (
      <div className="mt-2 flex items-center justify-between gap-3 border-y border-border/40 bg-transparent py-2.5">
        <span className="inline-flex items-center gap-2 text-xs text-foreground"><Table2 className="size-3.5" /> Workbook ready</span>
        <button
          type="button"
          onClick={() => onOpenWorkbench(data.artifactId as string)}
          className="text-xs font-medium underline underline-offset-4"
        >
          Open in Workbench
        </button>
      </div>
    );
  }
  if (block.display === 'contacts' && Array.isArray((data as { contacts?: unknown[] }).contacts)) {
    return <ContactsTableResult contacts={(data as { contacts: never[] }).contacts} />;
  }
  if (block.display === 'deals') {
    const deals = normalizeDealRows(data);
    return deals.length > 0 ? <DealsTableResult deals={deals} /> : null;
  }
  if (block.display === 'tours' && Array.isArray((data as { tours?: unknown[] }).tours)) {
    return <ToursResult data={data as { tours: never[] }} />;
  }
  if (block.display === 'properties') {
    const properties = normalizePropertyRows(data);
    return properties.length > 0 ? (
      <PropertiesCarouselResult properties={properties} onUserIntent={onUserIntent} />
    ) : null;
  }
  if (block.display === 'stats') {
    return <StatsResult data={data} />;
  }
  if (block.display === 'weather') {
    return <WeatherResult data={data} />;
  }
  if (block.display === 'area') {
    return <AreaResult data={data} />;
  }
  if (
    block.display === 'availability-picker' &&
    Array.isArray((data as { slots?: unknown[] }).slots)
  ) {
    const d = data as {
      slots: Array<{ startsAt: string; endsAt: string; label: string }>;
      contactId?: string;
      propertyAddress?: string;
      durationMinutes?: number;
    };
    return (
      <AvailabilityPickerCard
        slots={d.slots}
        contactId={d.contactId}
        propertyAddress={d.propertyAddress}
        durationMinutes={d.durationMinutes ?? 60}
        onSelectSlot={onUserIntent}
      />
    );
  }
  if (block.display === 'option-list' && Array.isArray((data as { options?: unknown[] }).options)) {
    const d = data as unknown as OptionListInput & { prompt?: string };
    return <OptionListResult input={d} prompt={d.prompt} onUserIntent={onUserIntent} />;
  }
  if (block.display === 'question-flow') {
    const d = data as unknown as QuestionFlowInput;
    return <QuestionFlowResult input={d} onUserIntent={onUserIntent} />;
  }
  if (block.display === 'message-draft' && typeof (data as { body?: unknown }).body === 'string') {
    return <MessageDraftResult data={data as unknown as MessageDraftData} onUserIntent={onUserIntent} />;
  }
  if (block.name === 'generate_studio_image' || block.display === 'generated-image') {
    return (
      <GeneratedImageResult
        data={data}
        prompt={typeof block.args?.prompt === 'string' ? block.args.prompt : undefined}
        status="complete"
      />
    );
  }
  return null;
}

export interface ToolGroupBlockViewProps {
  blocks: ToolCallBlock[];
  /** Call IDs that are mid-flight this turn. If any group member is live the
   *  whole group renders in the `pending` shimmer state — Claude-style. */
  liveCallIds?: Set<string>;
  /** Forwarded to interactive rich cards (availability picker). */
  onUserIntent?: (text: string) => void;
  onOpenWorkbench?: (artifactId: string) => void;
}

export function ToolGroupBlockView({
  blocks,
  liveCallIds,
  onUserIntent,
  onOpenWorkbench,
}: ToolGroupBlockViewProps) {
  const unique = useMemo(() => uniqueToolBlocks(blocks), [blocks]);
  const nestedTools = useMemo(() => unique.map(toNestedTool), [unique]);

  const anyLive = blocks.some((b) => liveCallIds?.has(b.callId));
  const state = toolGroupViewState(unique, anyLive);
  const shimmerLabel = inferShimmerLabel(unique);

  // Quiet count only — never "failed" or "Completed" in the same header.
  const completeLabel = toolGroupOutcomeLabel(unique);

  // One successful card per display/name. Walk newest-first so a later
  // retry that succeeded wins over earlier failures of the same tool.
  const richCards: ReactNode[] = [];
  const seen = new Set<string>();
  for (const block of [...unique].reverse()) {
    const key = block.display ?? block.name;
    if (seen.has(key)) continue;
    const node = richResultFor(block, onUserIntent, onOpenWorkbench);
    if (!node) continue;
    seen.add(key);
    richCards.unshift(<div key={`rich-${block.callId}`}>{node}</div>);
  }

  return (
    <Steps state={state} count={unique.length}>
      <ToolGroup
        state={state}
        nestedTools={nestedTools}
        completeLabel={completeLabel}
        shimmerLabel={shimmerLabel}
        interruptedLabel="Couldn't finish"
        showElapsed={false}
        maxVisibleTools={5}
      />
      {richCards.length > 0 && <div className="space-y-2">{richCards}</div>}
    </Steps>
  );
}

/** Pick a shimmer label that matches what the group is actually doing.
 *  Mostly-search tools read as "Searching"; mostly-action tools as "Working". */
function inferShimmerLabel(blocks: ToolCallBlock[]): string {
  let search = 0;
  let command = 0;
  for (const b of blocks) {
    const c = categorizeToolName(b.name);
    if (c === 'search' || c === 'file') search += 1;
    else if (c === 'command') command += 1;
  }
  if (search > 0 && command === 0) return 'Searching';
  if (command > 0 && search === 0) return 'Working';
  return 'Working';
}
