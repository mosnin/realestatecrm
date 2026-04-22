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

  // The handler's `display` hint tints the card so at-a-glance scanning
  // of the transcript tells a realtor which rows landed safely vs which
  // need a second look. We ONLY apply it to resolved blocks — in-flight
  // rows stay neutral so the transition to green/red feels definitive.
  const displayTint =
    status === 'complete' && block.display === 'success'
      ? 'border-emerald-500/25 bg-emerald-500/5'
      : status === 'error' || block.display === 'error'
        ? 'border-rose-500/25 bg-rose-500/5'
        : 'border-border bg-muted/30';

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden transition-colors',
        displayTint,
        className,
      )}
    >
      {/* Header — always visible */}
      <button
        type="button"
        disabled={!hasDetails}
        onClick={() => hasDetails && setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
          hasDetails && 'hover:bg-muted/50 cursor-pointer',
          !hasDetails && 'cursor-default',
        )}
      >
        <div className="w-7 h-7 rounded-md bg-background flex items-center justify-center flex-shrink-0 text-muted-foreground">
          <Icon size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{friendlyName(block.name)}</p>
          {block.result?.summary && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {block.result.summary.split('\n')[0]}
            </p>
          )}
        </div>
        <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium flex-shrink-0', tint)}>
          {iconEl}
          {label}
        </span>
        {hasDetails && (
          <span className="text-muted-foreground/60 flex-shrink-0">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
        )}
      </button>

      {/* Collapsible details */}
      {expanded && hasDetails && (
        <div className="border-t border-border px-3 py-2.5 space-y-3 bg-background/40">
          {Object.keys(block.args ?? {}).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Arguments
              </p>
              <pre className="text-[11px] bg-background/70 border border-border rounded-md px-2 py-1.5 overflow-x-auto font-mono text-foreground/80">
                {JSON.stringify(block.args, null, 2)}
              </pre>
            </div>
          )}
          {block.result?.summary && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Result
              </p>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {block.result.summary}
              </p>
            </div>
          )}
          {block.result?.error && block.result.ok === false && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1">
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
