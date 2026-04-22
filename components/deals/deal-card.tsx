'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  GripVertical,
  Pencil,
  Trash2,
  DollarSign,
  Calendar,
  Trophy,
  XCircle,
  PauseCircle,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/formatting';
import { dealHealth, inferNextAction, HEALTH_META } from '@/lib/deals/health';
import { summarizeChecklist, type DealChecklistItem } from '@/lib/deals/checklist';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
  /** Optional — stages endpoint attaches a minimal projection for the card chip. */
  checklist?: Pick<DealChecklistItem, 'completedAt' | 'dueAt' | 'label'>[];
};

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  MEDIUM: { label: 'Medium', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  HIGH: { label: 'High', className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
};

const STATUS_BADGE: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  won: { label: 'Won', icon: Trophy, className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  lost: { label: 'Lost', icon: XCircle, className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  on_hold: { label: 'On Hold', icon: PauseCircle, className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

interface DealCardProps {
  deal: DealWithRelations;
  slug: string;
  onDelete: (id: string) => void;
  onStatusChange?: (deal: DealWithRelations, status: 'won' | 'lost' | 'on_hold' | 'active') => void;
  /** Next stage in this pipeline — drives the "Advance stage" button. Null when this is the last stage. */
  nextStage?: DealStage | null;
  /** Called when the realtor clicks the "Advance" button. */
  onAdvanceStage?: (deal: DealWithRelations, nextStageId: string) => void;
}

export function DealCard({ deal, slug, onDelete, onStatusChange, nextStage, onAdvanceStage }: DealCardProps) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priority = PRIORITY_META[deal.priority];
  const statusBadge = deal.status && deal.status !== 'active' ? STATUS_BADGE[deal.status] : null;

  // ── Health dot & next action — replace the old "probability %" noise ────
  const health = dealHealth(deal);
  const healthMeta = HEALTH_META[health.state];
  const nextAction = inferNextAction(deal);
  const isActive = deal.status === 'active';
  const checklistSummary = summarizeChecklist(deal.checklist ?? []);

  const canAdvance = isActive && nextStage && onAdvanceStage;

  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <div
        className={cn(
          'group rounded-lg border border-border bg-card px-3.5 py-3 transition-all duration-150 hover:shadow-md hover:-translate-y-px cursor-pointer',
          deal.status === 'won' && 'border-green-200 dark:border-green-800',
          deal.status === 'lost' && 'opacity-60',
        )}
        onClick={() => router.push(`/s/${slug}/deals/${deal.id}`)}
      >
        <div className="flex items-start gap-2">
          {/* Drag handle — stops propagation so clicking it doesn't open the panel */}
          <button
            {...attributes}
            {...listeners}
            className="mt-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
            onClick={(e) => e.stopPropagation()}
            aria-label="Reorder deal"
          >
            <GripVertical size={15} />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row with health dot */}
            <div className="flex items-center gap-1.5">
              {isActive && (
                <span
                  className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', healthMeta.dotClass)}
                  title={health.reason ? `${healthMeta.label} — ${health.reason}` : healthMeta.label}
                  aria-label={`Health: ${healthMeta.label}${health.reason ? `, ${health.reason}` : ''}`}
                />
              )}
              <p className={cn('font-semibold text-sm leading-tight truncate', deal.status === 'lost' && 'line-through text-muted-foreground')}>
                {deal.title}
              </p>
            </div>

            {deal.address && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{deal.address}</p>
            )}

            {/* Next-action line — the most important thing on the card */}
            {nextAction && (
              <p className={cn(
                'text-xs font-medium mt-1.5 truncate',
                health.state === 'stuck' ? 'text-red-700 dark:text-red-400'
                  : health.state === 'at-risk' ? 'text-amber-700 dark:text-amber-400'
                  : 'text-foreground',
              )}>
                Next: {nextAction.label}
              </p>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {deal.value != null && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-1.5 py-0.5">
                  <DollarSign size={10} />
                  {deal.value.toLocaleString()}
                </span>
              )}
              <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold', priority.className)}>
                {priority.label}
              </span>
              {statusBadge && (
                <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold', statusBadge.className)}>
                  <statusBadge.icon size={9} />
                  {statusBadge.label}
                </span>
              )}
            </div>

            {deal.value != null && deal.commissionRate != null && (
              <p className="text-xs text-muted-foreground mt-1">
                GCI: {formatCompact(deal.value * deal.commissionRate / 100)}
              </p>
            )}

            {/* Closing-checklist chip — shows progress + the soonest deadline.
                Answers "where is this deal in real life?" in eight words. */}
            {checklistSummary && (() => {
              const due = checklistSummary.nextDueAt;
              const today = new Date(); today.setHours(0, 0, 0, 0);
              let dueLabel: string | null = null;
              if (due) {
                const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
                if (days < 0) dueLabel = `${Math.abs(days)}d overdue`;
                else if (days === 0) dueLabel = 'today';
                else if (days <= 14) dueLabel = `in ${days}d`;
                else dueLabel = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              }
              return (
                <div className={cn(
                  'flex items-center gap-1.5 mt-1.5 text-[11px]',
                  checklistSummary.anyOverdue ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground',
                )}>
                  <CheckCircle2 size={11} />
                  <span className="font-medium">{checklistSummary.complete}/{checklistSummary.total}</span>
                  {checklistSummary.nextLabel && (
                    <span className="truncate">
                      · {checklistSummary.nextLabel}
                      {dueLabel ? ` ${dueLabel}` : ''}
                    </span>
                  )}
                </div>
              );
            })()}

            {deal.dealContacts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {deal.dealContacts.slice(0, 2).map(({ contact }) => (
                  <Badge key={contact.id} variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-normal">
                    {contact.name}
                  </Badge>
                ))}
                {deal.dealContacts.length > 2 && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                    +{deal.dealContacts.length - 2}
                  </Badge>
                )}
              </div>
            )}

            {/* Advance-stage button — one-tap primary action on each card. Visible only
                for active deals that have a next stage in this pipeline. */}
            {canAdvance && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdvanceStage(deal, nextStage.id);
                }}
                className="mt-2.5 w-full inline-flex items-center justify-center gap-1 rounded-md border border-border bg-muted/40 hover:bg-foreground hover:text-background hover:border-foreground text-[11px] font-semibold py-1.5 px-2 transition-colors"
                title={`Move to ${nextStage.name}`}
              >
                <ArrowRight size={11} />
                <span className="truncate">Advance to {nextStage.name}</span>
              </button>
            )}
          </div>

          {/* Hover actions */}
          <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              title="Edit deal"
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); router.push(`/s/${slug}/deals/${deal.id}`); }}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              title="Delete deal"
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={(e) => { e.stopPropagation(); onDelete(deal.id); }}
            >
              <Trash2 size={12} />
            </button>
            {onStatusChange && (
              <>
                {deal.status !== 'won' && deal.status !== 'lost' && deal.status !== 'on_hold' && (
                  <button
                    type="button"
                    title="Mark as Won"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onStatusChange(deal, 'won'); }}
                  >
                    <Trophy size={12} />
                  </button>
                )}
                {deal.status !== 'lost' && deal.status !== 'won' && deal.status !== 'on_hold' && (
                  <button
                    type="button"
                    title="Mark as Lost"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={(e) => { e.stopPropagation(); onStatusChange(deal, 'lost'); }}
                  >
                    <XCircle size={12} />
                  </button>
                )}
                {deal.status !== 'on_hold' && deal.status !== 'won' && deal.status !== 'lost' && (
                  <button
                    type="button"
                    title="Put On Hold"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 transition-colors"
                    onClick={(e) => { e.stopPropagation(); onStatusChange(deal, 'on_hold'); }}
                  >
                    <PauseCircle size={12} />
                  </button>
                )}
                {deal.status !== 'active' && (
                  <button
                    type="button"
                    title="Reopen (set Active)"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); onStatusChange(deal, 'active'); }}
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Won-deal check chip */}
        {deal.status === 'won' && (
          <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-green-700 dark:text-green-400">
            <CheckCircle2 size={10} />
            Closed
          </div>
        )}
      </div>
    </div>
  );
}
