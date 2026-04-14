'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Pencil, Trash2, DollarSign, Calendar, Trophy, XCircle, PauseCircle, RotateCcw } from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/formatting';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  LOW: {
    label: 'Low',
    className: 'bg-muted text-muted-foreground',
  },
  MEDIUM: {
    label: 'Medium',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  },
  HIGH: {
    label: 'High',
    className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  },
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
}

export function DealCard({ deal, slug, onDelete, onStatusChange }: DealCardProps) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priority = PRIORITY_META[deal.priority];
  const statusBadge = deal.status && deal.status !== 'active' ? STATUS_BADGE[deal.status] : null;
  const followUpRaw = deal.followUpAt ? new Date(deal.followUpAt) : null;
  const followUpDate = followUpRaw && !isNaN(followUpRaw.getTime()) ? followUpRaw : null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const followUpOverdue = Boolean(
    followUpDate &&
      deal.status === 'active' &&
      followUpDate.getTime() < startOfToday.getTime(),
  );

  // --- Feature A: Close date countdown ---
  // Only shown for active deals with a valid closeDate within 30 days.
  const closeDateChip: { label: string; className: string } | null = (() => {
    if (deal.status !== 'active' || !deal.closeDate) return null;
    const raw = new Date(deal.closeDate);
    if (isNaN(raw.getTime())) return null;
    // Normalise closeDate to midnight local time so day-diff is date-only.
    const closeDay = new Date(raw);
    closeDay.setHours(0, 0, 0, 0);
    const diffMs = closeDay.getTime() - startOfToday.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      return { label: 'Closing today', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' };
    }
    if (diffDays >= 1 && diffDays <= 7) {
      return { label: `Closing in ${diffDays} day${diffDays === 1 ? '' : 's'}`, className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' };
    }
    if (diffDays >= 8 && diffDays <= 30) {
      return { label: `Closing in ${diffDays} days`, className: 'bg-muted text-muted-foreground' };
    }
    if (diffDays < 0) {
      const ago = Math.abs(diffDays);
      return { label: `Closed ${ago} day${ago === 1 ? '' : 's'} ago`, className: 'bg-destructive/10 text-destructive border border-destructive/30' };
    }
    // >30 days out — omit chip
    return null;
  })();

  // --- Feature B: Deal age / stage stuck indicator ---
  // Uses updatedAt as a proxy for when the deal last changed stage. This is
  // approximate — updatedAt is refreshed on any edit, not just stage changes.
  const stageAgeChip: { label: string; className: string } | null = (() => {
    if (deal.status !== 'active' || !deal.updatedAt) return null;
    const raw = new Date(deal.updatedAt);
    if (isNaN(raw.getTime())) return null;
    const updatedDay = new Date(raw);
    updatedDay.setHours(0, 0, 0, 0);
    const diffMs = startOfToday.getTime() - updatedDay.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return null;
    const label = `${diffDays}d in stage`;
    if (diffDays >= 30) {
      return { label, className: 'text-destructive' };
    }
    if (diffDays >= 15) {
      return { label, className: 'text-amber-600 dark:text-amber-400' };
    }
    // 8–14 days: neutral/muted
    return { label, className: 'text-muted-foreground' };
  })();

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
          >
            <GripVertical size={15} />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className={cn('font-semibold text-sm leading-tight truncate', deal.status === 'lost' && 'line-through text-muted-foreground')}>
              {deal.title}
            </p>
            {deal.address && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{deal.address}</p>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {deal.value != null && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-1.5 py-0.5">
                  <DollarSign size={10} />
                  {deal.value.toLocaleString()}
                </span>
              )}
              <span
                className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold',
                  priority.className
                )}
              >
                {priority.label}
              </span>
              {statusBadge && (
                <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold', statusBadge.className)}>
                  <statusBadge.icon size={9} />
                  {statusBadge.label}
                </span>
              )}
              {followUpDate && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold',
                    followUpOverdue
                      ? 'bg-destructive/10 text-destructive border border-destructive/30'
                      : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
                  )}
                >
                  <Calendar size={9} />
                  {followUpOverdue ? 'Overdue · ' : ''}
                  {followUpDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            {deal.value != null && deal.commissionRate != null && (
              <p className="text-xs text-muted-foreground mt-1">
                GCI: {formatCompact(deal.value * deal.commissionRate / 100)}
              </p>
            )}
            {deal.probability != null && (
              <div className="mt-1">
                <span
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold border',
                    deal.probability >= 70
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30'
                      : deal.probability >= 40
                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30'
                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30',
                  )}
                >
                  {deal.probability}%
                </span>
              </div>
            )}

            {deal.dealContacts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {deal.dealContacts.slice(0, 2).map(({ contact }) => (
                  <Badge
                    key={contact.id}
                    variant="outline"
                    className="text-[10px] py-0 px-1.5 h-4 font-normal"
                  >
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

            {/* Feature A & B: Close date countdown + stage stuck indicator.
                Rendered below primary content to defer to deal title/value (Apple HIG: Deference). */}
            {(closeDateChip || stageAgeChip) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {closeDateChip && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
                      closeDateChip.className,
                    )}
                  >
                    <Calendar size={9} />
                    {closeDateChip.label}
                  </span>
                )}
                {stageAgeChip && (
                  <span className={cn('text-[10px] font-medium', stageAgeChip.className)}>
                    {stageAgeChip.label}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
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
      </div>
    </div>
  );
}
