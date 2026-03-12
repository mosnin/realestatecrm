'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Pencil, Trash2, DollarSign } from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';
import { cn } from '@/lib/utils';

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

interface DealCardProps {
  deal: DealWithRelations;
  onEdit: (deal: DealWithRelations) => void;
  onDelete: (id: string) => void;
}

export function DealCard({ deal, onEdit, onDelete }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priority = PRIORITY_META[deal.priority];

  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <div className="group rounded-xl border border-border bg-card px-3.5 py-3 transition-all duration-150 hover:shadow-md hover:-translate-y-px">
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="mt-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 transition-colors"
          >
            <GripVertical size={15} />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{deal.title}</p>
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
            </div>

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
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={() => onEdit(deal)}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={() => onDelete(deal.id)}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
