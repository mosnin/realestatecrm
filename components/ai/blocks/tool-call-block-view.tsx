'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  XCircle,
  MinusCircle,
  Lock,
  Users,
  Briefcase,
  CalendarDays,
  FileText,
  BarChart3,
  Mail,
  MessageSquare,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolCallBlock } from '@/lib/ai-tools/blocks';
import { ContactsResult } from './tool-results/contacts-result';
import { DealsResult } from './tool-results/deals-result';
import { ToursResult } from './tool-results/tours-result';

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
};

/** Friendly title — the tool's name is snake_case, UI wants "Search contacts". */
function friendlyName(name: string): string {
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface ToolCallBlockViewProps {
  block: ToolCallBlock;
  /** Is this call currently running? Overrides persisted status for live turns. */
  live?: boolean;
  className?: string;
}

export function ToolCallBlockView({ block, live, className }: ToolCallBlockViewProps) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[block.name] ?? Wrench;

  const status: 'running' | ToolCallBlock['status'] = live ? 'running' : block.status;

  const {
    label,
    iconEl,
    tint,
  }: { label: string; iconEl: React.ReactNode; tint: string } = (() => {
    switch (status) {
      case 'running':
        return {
          label: 'Running',
          iconEl: <Loader2 size={12} className="animate-spin" />,
          tint: 'text-muted-foreground',
        };
      case 'complete':
        return {
          label: 'Complete',
          iconEl: <CheckCircle2 size={12} />,
          tint: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'error':
        return {
          label: 'Failed',
          iconEl: <XCircle size={12} />,
          tint: 'text-rose-600 dark:text-rose-400',
        };
      case 'denied':
        return {
          label: 'Denied',
          iconEl: <Lock size={12} />,
          tint: 'text-muted-foreground',
        };
      case 'skipped':
        return {
          label: 'Skipped',
          iconEl: <MinusCircle size={12} />,
          tint: 'text-muted-foreground',
        };
      default:
        return { label: status, iconEl: null, tint: 'text-muted-foreground' };
    }
  })();

  const hasDetails = !!block.result?.summary || Object.keys(block.args ?? {}).length > 0;

  // Phase 5 — rich inline result rendering. Tools opt in via the `display`
  // hint on their handler return. When the result resolves successfully and
  // the data shape is one we know how to render, we show the rich card stack
  // BELOW the compact row by default (no expand-click needed).
  const richResult: React.ReactNode = (() => {
    if (status !== 'complete' || !block.result?.ok) return null;
    const data = block.result.data as Record<string, unknown> | undefined;
    if (!data) return null;
    if (block.display === 'contacts' && Array.isArray((data as { contacts?: unknown[] }).contacts)) {
      return <ContactsResult data={data as { contacts: never[] }} />;
    }
    if (block.display === 'deals' && Array.isArray((data as { deals?: unknown[] }).deals)) {
      return <DealsResult data={data as { deals: never[] }} />;
    }
    if (block.display === 'tours' && Array.isArray((data as { tours?: unknown[] }).tours)) {
      return <ToursResult data={data as { tours: never[] }} />;
    }
    return null;
  })();

  // The handler's `display` hint tints the card so at-a-glance scanning
  // of the transcript tells a realtor which rows landed safely vs which
  // need a second look. We ONLY apply it to resolved blocks — in-flight
  // rows stay neutral so the transition feels definitive. The warning
  // variant (amber) is for "completed but caveat" cases — e.g. a
  // sub-agent whose tool budget ran out before it could finish research.
  const displayTint =
    status === 'running'
      ? 'border-border bg-muted/30'
      : block.display === 'error' || status === 'error'
        ? 'border-rose-500/25 bg-rose-500/5'
        : block.display === 'warning'
          ? 'border-amber-500/30 bg-amber-500/10'
          : block.display === 'success' && status === 'complete'
            ? 'border-emerald-500/25 bg-emerald-500/5'
            : 'border-border bg-muted/30';

  // Derive a brief args hint shown inline (first key=value pair, truncated).
  const argsEntries = Object.entries(block.args ?? {});
  const argsHint =
    argsEntries.length > 0
      ? argsEntries
          .slice(0, 2)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ')
          .slice(0, 60) + (argsEntries.length > 2 ? ' …' : '')
      : null;

  // Colored left-edge bar mirrors the displayTint semantic so the row is
  // scannable without reading the status badge.
  const accentBar =
    status === 'running'
      ? 'bg-muted-foreground/30'
      : block.display === 'error' || status === 'error'
        ? 'bg-rose-500/60'
        : block.display === 'warning'
          ? 'bg-amber-500/60'
          : block.display === 'success' && status === 'complete'
            ? 'bg-emerald-500/60'
            : 'bg-muted-foreground/20';

  return (
    <div className={cn('group relative flex flex-col', className)}>
      {/* Compact step row */}
      <button
        type="button"
        disabled={!hasDetails}
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={cn(
          'relative flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-lg border text-left min-h-[36px]',
          'transition-colors',
          displayTint,
          hasDetails && 'hover:bg-muted/40 cursor-pointer',
          !hasDetails && 'cursor-default',
        )}
      >
        {/* Left accent bar */}
        <span
          aria-hidden
          className={cn('absolute left-0 inset-y-0 w-[3px] rounded-l-lg flex-shrink-0', accentBar)}
        />

        {/* Tool icon */}
        <span className={cn('flex-shrink-0', tint)}>
          <Icon size={13} />
        </span>

        {/* Tool name */}
        <span className="text-[12px] font-medium text-foreground flex-shrink-0">
          {friendlyName(block.name)}
        </span>

        {/* Args hint — shown only when not expanded and args exist */}
        {argsHint && !expanded && (
          <span className="text-[11px] text-muted-foreground/70 truncate flex-1 min-w-0 font-mono">
            {argsHint}
          </span>
        )}

        {/* Spacer when no args hint */}
        {(!argsHint || expanded) && <span className="flex-1" />}

        {/* Status badge */}
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] font-medium flex-shrink-0 ml-1',
            tint,
          )}
        >
          {iconEl}
          {label}
        </span>

        {/* Expand chevron */}
        {hasDetails && (
          <span className="text-muted-foreground/50 flex-shrink-0 ml-0.5">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>

      {/* Rich inline result rendering — visible by default for known data
          shapes (contacts, deals) so the realtor doesn't have to expand. */}
      {richResult}

      {/* Collapsible details — rendered below the row, slightly indented */}
      {expanded && hasDetails && (
        <div className="mt-1 ml-3 pl-3 border-l-2 border-border space-y-2.5 py-2">
          {argsEntries.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Arguments
              </p>
              <pre className="text-[11px] bg-muted/30 border border-border rounded-md px-2 py-1.5 overflow-x-auto font-mono text-foreground/80">
                {JSON.stringify(block.args, null, 2)}
              </pre>
            </div>
          )}
          {block.result?.summary && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Result
              </p>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {block.result.summary}
              </p>
            </div>
          )}
          {block.result?.error && block.result.ok === false && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
                Error
              </p>
              <p className="text-xs text-rose-700 dark:text-rose-300">{block.result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
