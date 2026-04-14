'use client';

import { useEffect, useRef, useState } from 'react';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DealCard } from './deal-card';
import { Input } from '@/components/ui/input';
import { Plus, LayoutList, SquarePen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

interface KanbanColumnProps {
  stage: DealStage;
  deals: DealWithRelations[];
  slug: string;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: DealWithRelations) => void;
  onDeleteDeal: (id: string) => void;
  onDeleteStage: (stage: DealStage) => void;
  onOpenPanel: (deal: DealWithRelations) => void;
  onDealCreated: () => void;
}

export function KanbanColumn({
  stage,
  deals,
  slug,
  onAddDeal,
  onEditDeal,
  onDeleteDeal,
  onOpenPanel,
  onDealCreated,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  const totalValue = deals.reduce((s, d) => s + (d.value ?? 0), 0);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Guards to avoid double-submit / cancel racing with blur when pressing Enter
  const submittedRef = useRef(false);

  function focusInput() {
    const el = containerRef.current?.querySelector<HTMLInputElement>(
      'input[data-slot="input"]',
    );
    el?.focus();
  }

  // Click-outside cancels
  useEffect(() => {
    if (!quickAddOpen) return;
    function onDocPointer(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        cancelQuickAdd();
      }
    }
    document.addEventListener('mousedown', onDocPointer);
    return () => document.removeEventListener('mousedown', onDocPointer);
  }, [quickAddOpen]);

  function cancelQuickAdd() {
    setQuickAddOpen(false);
    setQuickAddTitle('');
  }

  async function submitQuickAdd() {
    const title = quickAddTitle.trim();
    if (!title || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title,
          stageId: stage.id,
          priority: 'MEDIUM',
        }),
      });
      if (!res.ok) {
        toast.error('Failed to create deal');
        setSubmitting(false);
        submittedRef.current = false;
        // Keep the input open with the title so user can retry
        focusInput();
        return;
      }
      toast.success('Deal created');
      setQuickAddTitle('');
      setSubmitting(false);
      submittedRef.current = false;
      onDealCreated();
      // Keep the input open for rapid successive adds; refocus
      focusInput();
    } catch {
      toast.error('Failed to create deal');
      setSubmitting(false);
      submittedRef.current = false;
      focusInput();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitQuickAdd();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelQuickAdd();
    }
  }

  function onBlur() {
    // Defer so that Enter-driven submissions aren't cancelled by blur firing.
    // Also allow click on the "open full form" icon within the container to not cancel.
    setTimeout(() => {
      if (submittedRef.current || submitting) return;
      // If focus is still somewhere inside the container, keep open
      if (containerRef.current && containerRef.current.contains(document.activeElement)) return;
      cancelQuickAdd();
    }, 0);
  }

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
          <span className="text-[11px] text-muted-foreground bg-muted rounded-md px-2 py-0.5 font-medium tabular-nums">
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
        className={`flex-1 min-h-24 rounded-lg transition-all duration-150 ${
          isOver
            ? 'bg-muted/50 border-2 border-dashed border-border'
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

      <div ref={containerRef} className="mt-2">
        {quickAddOpen ? (
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              value={quickAddTitle}
              onChange={(e) => setQuickAddTitle(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              placeholder="Deal title…"
              disabled={submitting}
              className="h-8 text-sm"
              aria-label={`Quick add deal to ${stage.name}`}
            />
            <button
              type="button"
              // onMouseDown so the click fires before the input blur cancels
              onMouseDown={(e) => {
                e.preventDefault();
                const prefill = quickAddTitle.trim();
                cancelQuickAdd();
                onAddDeal(stage.id);
                // If there is a title typed, we still just open the full form;
                // the user can paste / retype. Keeping it simple to avoid
                // cross-component state plumbing.
                void prefill;
              }}
              title="Open full form"
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <SquarePen size={13} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="flex-1 flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setQuickAddOpen(true)}
            >
              <Plus size={13} />
              Add deal
            </button>
            <button
              type="button"
              onClick={() => onAddDeal(stage.id)}
              title="Open full form"
              className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <SquarePen size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
