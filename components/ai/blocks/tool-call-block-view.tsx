'use client';

import {
  CheckCircle2,
  Users,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  BarChart3,
  Mail,
  MessageSquare,
  Workflow,
  Wrench,
  Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AgentToolResult,
  type AgentToolResultStatus,
} from '@/components/ai/agent-status';
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

/** Per-tool icon map. Generic Wrench fallback keeps unknown tools readable. */
const TOOL_ICONS: Record<string, typeof Users> = {
  search_contacts: Users,
  get_contact: Users,
  search_deals: Briefcase,
  pipeline_summary: BarChart3,
  search_tours: CalendarDays,
  get_note: FileText,
  send_email: Mail,
  send_sms: MessageSquare,
  send_email_now: Mail,
  send_sms_now: MessageSquare,
  draft_message: Mail,
  add_person: Users,
  create_automation: Workflow,
  analyze_property_values: BarChart3,
  add_property: Building2,
  find_property: Building2,
  search_properties: Building2,
};

/**
 * Tool-specific running verb. Realtors don't think in developer words like
 * "Running" — they think in actions. Each verb maps to what the tool is
 * actually doing from the user's perspective.
 */
const TOOL_RUNNING_LABEL: Record<string, string> = {
  search_contacts: 'Searching…',
  find_person: 'Searching…',
  get_contact: 'Searching…',
  pipeline_summary: 'Analyzing…',
  find_stuck_deals: 'Analyzing…',
  find_quiet_hot_persons: 'Analyzing…',
  find_deal: 'Looking up…',
  find_overdue_followups: 'Looking up…',
  schedule_tour: 'Checking calendar…',
  reschedule_tour: 'Checking calendar…',
  check_availability: 'Checking calendar…',
  find_tours: 'Checking calendar…',
  send_email: 'Sending email…',
  draft_email: 'Drafting…',
  draft_message: 'Drafting…',
  send_email_now: 'Sending…',
  send_sms_now: 'Texting…',
  send_sms: 'Sending text…',
  draft_sms: 'Writing…',
  add_person: 'Creating contact…',
  create_automation: 'Creating automation…',
  analyze_property_values: 'Analyzing property values…',
  recall_history: 'Checking history…',
  create_plan: 'Planning…',
  planner: 'Planning…',
  note_on_person: 'Saving note…',
  note_on_deal: 'Saving note…',
  note_on_property: 'Saving note…',
  find_property: 'Looking up…',
  search_properties: 'Searching…',
  add_property: 'Saving…',
  create_deal: 'Updating deal…',
  mark_deal_won: 'Updating deal…',
  mark_deal_lost: 'Updating deal…',
  move_deal_stage: 'Updating deal…',
  set_followup: 'Updating…',
  clear_followup: 'Updating…',
};

/** Successful mutations and grounded analyses deserve an explicit receipt. */
const TOOL_COMPLETE_LABEL: Record<string, string> = {
  send_email: 'Email sent',
  send_sms: 'Text sent',
  add_person: 'Contact created',
  create_automation: 'Automation created',
  analyze_property_values: 'Analysis grounded',
};

const EXECUTION_RECEIPT_TOOLS = new Set(Object.keys(TOOL_COMPLETE_LABEL));

/** Friendly title — the tool's name is snake_case, UI wants "Search contacts". */
function friendlyName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Keep inline messages short enough to fit the transcript column. The full
 *  result stays in the expandable detail pane. */
function truncateInlineMessage(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Produce a short prose hint from the tool args that a realtor can read at
 * a glance. UUID fields (contactId, dealId) are meaningless to realtors so
 * we skip them. Returns null when nothing useful can be shown.
 */
function argsProseHint(args: Record<string, unknown> | undefined | null): string | null {
  if (!args) return null;

  // UUIDs: skip entirely — they mean nothing to a realtor.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUUID = (v: unknown): boolean =>
    typeof v === 'string' && UUID_RE.test(v);

  if (typeof args.name === 'string' && args.name && !isUUID(args.name)) {
    return `for ${args.name}`;
  }
  if (typeof args.query === 'string' && args.query) {
    return `for ${args.query}`;
  }
  if (typeof args.subject === 'string' && args.subject) {
    return `re: ${args.subject}`;
  }
  if (typeof args.stage === 'string' && args.stage) {
    return `→ ${args.stage}`;
  }

  // Skip if the only fields are UUIDs or known-useless ids.
  const UUID_KEYS = new Set(['contactId', 'dealId', 'tourId', 'propertyId', 'id']);
  const meaningful = Object.entries(args).filter(
    ([k, v]) => !UUID_KEYS.has(k) && !isUUID(v) && typeof v !== 'object',
  );
  if (meaningful.length === 0) return null;

  // Fall back to first meaningful string value.
  const [, val] = meaningful[0];
  if (typeof val === 'string' && val) return val.slice(0, 60);
  if (typeof val === 'number') return String(val);

  return null;
}

interface ToolCallBlockViewProps {
  block: ToolCallBlock;
  /** Is this call currently running? Overrides persisted status for live turns. */
  live?: boolean;
  /** Interactive cards (availability picker) bubble user intents back up
   *  through this prop. The workspace forwards them as the next user
   *  message. Omitted on read-only history surfaces. */
  onUserIntent?: (text: string) => void;
  onOpenWorkbench?: (artifactId: string) => void;
  className?: string;
}

export function ToolCallBlockView({
  block,
  live,
  onUserIntent,
  onOpenWorkbench,
  className,
}: ToolCallBlockViewProps) {
  const Icon = TOOL_ICONS[block.name] ?? Wrench;

  // Rollback must remove the complete Workbench affordance, including the
  // generic tool row whose friendly name would otherwise reveal a disabled
  // feature in historical transcripts. Full Chippi passes this callback only
  // while the deployment flag is enabled.
  if (block.display === 'workbench' && !onOpenWorkbench) return null;

  const status = live ? 'running' : block.status;
  const resultStatus: AgentToolResultStatus = status === 'running'
    ? 'running'
    : status === 'complete'
      ? 'success'
      : status === 'error'
        ? 'error'
        : 'cancelled';
  const resultTitle = status === 'running'
    ? TOOL_RUNNING_LABEL[block.name] ?? 'Working…'
    : status === 'complete'
      ? TOOL_COMPLETE_LABEL[block.name] ?? `${friendlyName(block.name)} complete`
      : status === 'error'
        ? `${friendlyName(block.name)} failed`
        : status === 'denied'
          ? `${friendlyName(block.name)} denied`
          : `${friendlyName(block.name)} skipped`;

  // Phase 5 — rich inline result rendering. Tools opt in via the `display`
  // hint on their handler return. When the result resolves successfully and
  // the data shape is one we know how to render, we show the rich card stack
  // BELOW the compact row by default (no expand-click needed).
  const richResult: React.ReactNode = (() => {
    if (status !== 'complete' || !block.result?.ok) return null;
    const data = block.result.data as Record<string, unknown> | undefined;
    if (!data) return null;
    if (block.display === 'openui' && typeof data.program === 'string') {
      return <ChippiOpenUiRenderer program={data.program} />;
    }
    // A persisted tool result can outlive a rollout. Without an enabled opener,
    // suppress the whole Workbench-specific card rather than advertise an inert
    // customer control after the feature has been rolled back.
    if (
      block.display === 'workbench'
      && typeof data.artifactId === 'string'
      && onOpenWorkbench
    ) {
      return (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
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
    // Contacts / deals → tool-ui DataTable. Properties → tool-ui ItemCarousel.
    // Analytics → tool-ui StatsDisplay. Weather (tour prep) → WeatherWidget.
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
    // ── Interactive clarification (ask_realtor) ──────────────────────────
    // A small set of choices → OptionList; the realtor's pick rounds back
    // through onUserIntent as the next turn.
    if (block.display === 'option-list' && Array.isArray((data as { options?: unknown[] }).options)) {
      const d = data as unknown as OptionListInput & { prompt?: string };
      return <OptionListResult input={d} prompt={d.prompt} onUserIntent={onUserIntent} />;
    }
    // A branching / multi-step clarification → QuestionFlow; answers round
    // back through onUserIntent once complete.
    if (block.display === 'question-flow') {
      const d = data as unknown as QuestionFlowInput;
      return <QuestionFlowResult input={d} onUserIntent={onUserIntent} />;
    }
    // ── Email draft awaiting approval (draft_message / draft_email) ───────
    // MessageDraft with Send / Cancel. Send hits the real approve-and-send
    // endpoint when a draftId is present, else falls back to onUserIntent.
    if (block.display === 'message-draft' && typeof (data as { body?: unknown }).body === 'string') {
      return <MessageDraftResult data={data as unknown as MessageDraftData} onUserIntent={onUserIntent} />;
    }
    return null;
  })();

  // Inline execution receipts keep consequential successes honest: the user
  // can see what actually happened without expanding developer details or
  // relying on the assistant's follow-up prose. Read-only tools stay compact
  // so ordinary searches do not duplicate the next chat message.
  const inlineSuccess =
    status === 'complete' &&
    block.result?.ok === true &&
    EXECUTION_RECEIPT_TOOLS.has(block.name) &&
    block.result.summary.trim()
      ? truncateInlineMessage(block.result.summary.trim(), 220)
      : null;

  // Inline error breadcrumb. On failure the realtor needs to know WHY without
  // hunting for the expand chevron — Stream C's status-honesty pattern
  // (commit 4859066). Truncated to keep the transcript scannable; the full
  // text remains in the expandable details pane.
  //
  const inlineError =
    status === 'error' && (block.result?.error || block.result?.summary)
      ? truncateInlineMessage(block.result?.error ?? block.result?.summary ?? '', 160)
      : null;

  // Prose hint derived from args — non-monospace, human readable.
  const argsHint = argsProseHint(block.args);

  const argsEntries = Object.entries(block.args ?? {});
  const hasDetails = argsEntries.length > 0 || !!block.result?.summary || !!block.result?.error;
  const generatedMedia = block.name === 'generate_studio_image' || block.display === 'generated-image';
  const copyText = hasDetails
    ? JSON.stringify(
        {
          arguments: block.args,
          result: block.result ?? null,
        },
        null,
        2,
      )
    : undefined;

  return (
    <div className={cn('group relative', className)}>
      {generatedMedia ? (
        <GeneratedImageResult
          data={block.result?.data as Record<string, unknown> | undefined}
          prompt={typeof block.args?.prompt === 'string' ? block.args.prompt : undefined}
          status={status === 'running' ? 'running' : status === 'complete' ? 'complete' : 'error'}
          error={block.result?.error ?? (status === 'error' ? block.result?.summary : undefined)}
        />
      ) : (
        <AgentToolResult
          tool={block.name}
          title={resultTitle}
          status={resultStatus}
          icon={<Icon className="size-3.5" />}
          meta={argsHint ?? undefined}
          collapseOnComplete
          maxHeight={220}
          copyText={copyText}
        >
          {hasDetails ? (
            <div className="space-y-2.5">
              {argsEntries.length > 0 ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Arguments
                  </p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-border/55 bg-background/70 px-2.5 py-2 font-mono text-[11px] text-foreground/80">
                    {JSON.stringify(block.args, null, 2)}
                  </pre>
                </div>
              ) : null}
              {block.result?.summary ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Result
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {block.result.summary}
                  </p>
                </div>
              ) : null}
              {block.result?.error && block.result.ok === false ? (
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Error
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {block.result.error}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </AgentToolResult>
      )}

      {!generatedMedia && inlineError && (
        <p
          role="status"
          className="text-[12px] text-muted-foreground mt-1 px-1 leading-snug"
        >
          {inlineError}
        </p>
      )}

      {!generatedMedia && inlineSuccess && (
        <div
          role="status"
          aria-label="Execution receipt"
          className={cn(
            'mx-3 mt-1.5 flex items-start gap-2 rounded-xl border px-3 py-2',
            'border-emerald-500/15 bg-emerald-500/[0.035]',
            'shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none',
          )}
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <p className="text-[12px] leading-relaxed text-foreground/80">
            {inlineSuccess}
          </p>
        </div>
      )}

      {!generatedMedia ? richResult : null}
    </div>
  );
}
