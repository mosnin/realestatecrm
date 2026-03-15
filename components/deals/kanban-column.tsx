'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DealCard } from './deal-card';
import { Button } from '@/components/ui/button';
import { Plus, LayoutList } from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';

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
  onOpenPanel: (deal: DealWithRelations) => void;
}

export function KanbanColumn({
  stage,
  deals,
  onAddDeal,
  onEditDeal,
  onDeleteDeal,
  onOpenPanel,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: stage.color }}
          />
          <span className="font-semibold text-sm">{stage.name}</span>
          <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-medium tabular-nums">
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
        className={`flex-1 min-h-24 rounded-xl transition-all duration-150 ${
          isOver
            ? 'bg-primary/5 border-2 border-dashed border-primary/30'
            : 'bg-muted/20 border-2 border-transparent'
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
              onOpenPanel={onOpenPanel}
            />
          ))}
          {deals.length === 0 && !isOver && (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground/40">
              <LayoutList size={20} />
              <p className="text-xs">No deals yet</p>
            </div>
          )}
        </SortableContext>
      </div>

      <button
        type="button"
        className="mt-2 w-full flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        onClick={() => onAddDeal(stage.id)}
      >
        <Plus size={13} />
        Add deal
      </button>
    </div>
  );
}
