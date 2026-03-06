'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GripVertical, Pencil, Trash2, DollarSign } from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@prisma/client';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-neutral-500/20 text-neutral-400',
  MEDIUM: 'bg-yellow-500/20 text-yellow-400',
  HIGH: 'bg-red-500/20 text-red-400'
};

interface DealCardProps {
  deal: DealWithRelations;
  onEdit: (deal: DealWithRelations) => void;
  onDelete: (id: string) => void;
}

export function DealCard({ deal, onEdit, onDelete }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="mb-2 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <button
              {...attributes}
              {...listeners}
              className="mt-0.5 text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
            >
              <GripVertical size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{deal.title}</p>
              {deal.address && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {deal.address}
                </p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {deal.value != null && (
                  <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                    <DollarSign size={11} />
                    {deal.value.toLocaleString()}
                  </span>
                )}
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_COLORS[deal.priority]}`}
                >
                  {deal.priority}
                </span>
              </div>
              {deal.dealContacts.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {deal.dealContacts.slice(0, 2).map(({ contact }) => (
                    <Badge key={contact.id} variant="outline" className="text-xs py-0">
                      {contact.name}
                    </Badge>
                  ))}
                  {deal.dealContacts.length > 2 && (
                    <Badge variant="outline" className="text-xs py-0">
                      +{deal.dealContacts.length - 2}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => onEdit(deal)}
              >
                <Pencil size={12} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => onDelete(deal.id)}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
