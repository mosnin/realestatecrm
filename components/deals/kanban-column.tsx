'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DealCard } from './deal-card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@prisma/client';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

interface KanbanColumnProps {
  stage: DealStage;
  deals: DealWithRelations[];
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: DealWithRelations) => void;
  onDeleteDeal: (id: string) => void;
}

export function KanbanColumn({
  stage,
  deals,
  onAddDeal,
  onEditDeal,
  onDeleteDeal
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <span className="font-semibold text-sm">{stage.name}</span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-xs text-muted-foreground font-medium">
            ${totalValue.toLocaleString()}
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-20 rounded-lg transition-colors ${
          isOver ? 'bg-accent/30' : 'bg-muted/30'
        } p-2`}
      >
        <SortableContext
          items={deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onEdit={onEditDeal}
              onDelete={onDeleteDeal}
            />
          ))}
        </SortableContext>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full justify-start text-muted-foreground text-xs"
        onClick={() => onAddDeal(stage.id)}
      >
        <Plus size={14} className="mr-1" />
        Add deal
      </Button>
    </div>
  );
}
