'use client';

/**
 * Backend-free clone of the deals kanban board.
 *
 * The real `KanbanBoard` self-fetches `/api/stages`, subscribes to Supabase
 * realtime, and POSTs on every mutation - none of which can run in the demo.
 * So we replicate its render (the same DnD context, the same columns, the same
 * DragOverlay) but feed it hardcoded state and make every mutation handler
 * either a local-state update (drag) or a no-op (delete / status / add).
 *
 * Reused as-is: KanbanColumn, DealCard (via the column), DealQuickPanel.
 * No network is ever touched.
 */

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDndContext,
  useSensor,
  useSensors,
  closestCorners,
  type DropAnimation,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';
import { KanbanColumn } from '@/components/deals/kanban-column';
import { DealQuickPanel } from '@/components/deals/deal-quick-panel';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { TITLE_FONT } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { formatCurrency as _formatCurrency } from '@/lib/formatting';
import { dealHealth } from '@/lib/deals/health';
import type { DealStage } from '@/lib/types';
import type { BoardStatus, BoardFocus } from '@/components/deals/deals-page-client';
import { DEMO_STAGES, type DemoStageWithDeals, type DemoDeal } from './demo-data';

// Same drop-snap config as the real board - 180ms Apple ease, no spring.
const KANBAN_DROP_ANIMATION: DropAnimation = {
  duration: 180,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

function formatCurrency(n: number | null) {
  if (n == null) return null;
  return _formatCurrency(n);
}

interface SortableKanbanColumnProps {
  stage: DemoStageWithDeals;
  deals: DemoDeal[];
  onStatusChange: (deal: DemoDeal, status: 'won' | 'lost' | 'on_hold' | 'active') => void;
  nextStage?: DealStage | null;
  onAdvanceStage: (deal: DemoDeal, nextStageId: string) => void;
  onOpenDeal: (deal: DemoDeal) => void;
}

function SortableKanbanColumn({
  stage,
  deals,
  onStatusChange,
  nextStage,
  onAdvanceStage,
  onOpenDeal,
}: SortableKanbanColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `stage:${stage.id}` });

  const { active, over } = useDndContext();
  const activeId = active?.id?.toString() ?? null;
  const overId = over?.id?.toString() ?? null;
  const isDealDrag = !!activeId && !activeId.startsWith('stage:');
  const overMatchesStage =
    !!overId && (overId === stage.id || deals.some((d) => d.id === overId));
  const isDropTarget = isDealDrag && overMatchesStage;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg transition-colors duration-150',
        isDropTarget && 'bg-foreground/[0.04]',
      )}
    >
      <KanbanColumn
        stage={stage}
        deals={deals}
        slug="demo"
        onAddDeal={() => {}}
        onDeleteDeal={() => {}}
        onDeleteStage={() => {}}
        onDealCreated={() => {}}
        onStatusChange={onStatusChange}
        nextStage={nextStage}
        onAdvanceStage={onAdvanceStage}
        onOpenDeal={onOpenDeal}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

interface DemoBoardProps {
  boardStatus: BoardStatus;
  focus: BoardFocus;
  searchQuery: string;
}

export function DemoBoard({ boardStatus, focus, searchQuery }: DemoBoardProps) {
  const [stages, setStages] = useState<DemoStageWithDeals[]>(DEMO_STAGES);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [panelDealId, setPanelDealId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function findStageForDeal(dealId: string) {
    return stages.find((s) => s.deals.some((d) => d.id === dealId));
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id.toString();
    if (id.startsWith('stage:')) setActiveStageId(id.slice('stage:'.length));
    else setActiveDealId(id);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.id.toString().startsWith('stage:')) return;

    const activeStage = findStageForDeal(active.id as string);
    const overStage = stages.find(
      (s) => s.id === over.id || s.deals.some((d) => d.id === over.id),
    );
    if (!activeStage || !overStage || activeStage.id === overStage.id) return;

    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === activeStage.id) {
          return { ...stage, deals: stage.deals.filter((d) => d.id !== active.id) };
        }
        if (stage.id === overStage.id) {
          const activeDeal = activeStage.deals.find((d) => d.id === active.id)!;
          return {
            ...stage,
            deals: [...stage.deals, { ...activeDeal, stageId: overStage.id, stage: overStage }],
          };
        }
        return stage;
      }),
    );
  }

  // Drag end updates LOCAL state only - never the network.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (active.id.toString().startsWith('stage:')) {
      setActiveStageId(null);
      if (!over) return;
      const activeRawId = active.id.toString().slice('stage:'.length);
      const overRawId = over.id.toString().startsWith('stage:')
        ? over.id.toString().slice('stage:'.length)
        : null;
      if (!overRawId || activeRawId === overRawId) return;
      const oldIndex = stages.findIndex((s) => s.id === activeRawId);
      const newIndex = stages.findIndex((s) => s.id === overRawId);
      if (oldIndex === -1 || newIndex === -1) return;
      setStages((prev) => arrayMove(prev, oldIndex, newIndex));
      return;
    }

    setActiveDealId(null);
    // The cross-stage move already happened in handleDragOver; nothing to
    // persist and nowhere to persist it.
  }

  // Status / advance also stay local-only.
  function handleStatusChange(deal: DemoDeal, status: 'won' | 'lost' | 'on_hold' | 'active') {
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        deals: s.deals.map((d) => (d.id === deal.id ? { ...d, status } : d)),
      })),
    );
  }

  function handleAdvanceStage(deal: DemoDeal, nextStageId: string) {
    const nextStage = stages.find((s) => s.id === nextStageId);
    if (!nextStage) return;
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === deal.stageId) {
          return { ...s, deals: s.deals.filter((d) => d.id !== deal.id) };
        }
        if (s.id === nextStageId) {
          return {
            ...s,
            deals: [...s.deals, { ...deal, stageId: nextStageId, stage: nextStage }],
          };
        }
        return s;
      }),
    );
  }

  function handlePanelStageChange(dealId: string, newStageId: string) {
    const currentStage = stages.find((s) => s.deals.some((d) => d.id === dealId));
    const newStage = stages.find((s) => s.id === newStageId);
    if (!currentStage || !newStage || currentStage.id === newStageId) return;
    const deal = currentStage.deals.find((d) => d.id === dealId);
    if (!deal) return;
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === currentStage.id) {
          return { ...s, deals: s.deals.filter((d) => d.id !== dealId) };
        }
        if (s.id === newStageId) {
          return { ...s, deals: [...s.deals, { ...deal, stageId: newStageId, stage: newStage }] };
        }
        return s;
      }),
    );
  }

  const activeDeal = stages.flatMap((s) => s.deals).find((d) => d.id === activeDealId);
  const activeStage = activeStageId ? stages.find((s) => s.id === activeStageId) : null;

  const searchLower = searchQuery.toLowerCase().trim();

  const statusMatches = useMemo(() => {
    if (boardStatus === 'active') return (s: string) => s === 'active';
    return (s: string) => s === 'won' || s === 'lost' || s === 'on_hold';
  }, [boardStatus]);

  const monthBounds = useMemo(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }, []);

  const filteredStages = useMemo(() => {
    function dealMatchesSearch(deal: DemoDeal) {
      if (!searchLower) return true;
      return (
        deal.title.toLowerCase().includes(searchLower) ||
        (deal.address?.toLowerCase().includes(searchLower) ?? false) ||
        deal.dealContacts.some((dc) => dc.contact.name.toLowerCase().includes(searchLower))
      );
    }
    function focusMatches(deal: DemoDeal): boolean {
      if (focus === null) return true;
      if (focus === 'at-risk') return dealHealth(deal).state !== 'on-track';
      if (focus === 'closing-month') {
        if (!deal.closeDate) return false;
        const close = new Date(deal.closeDate as unknown as string);
        return (
          !isNaN(close.getTime()) &&
          close >= monthBounds.start &&
          close < monthBounds.end
        );
      }
      return true;
    }
    return stages.map((s) => ({
      ...s,
      deals: s.deals.filter(
        (deal) =>
          statusMatches(deal.status as string) &&
          dealMatchesSearch(deal) &&
          focusMatches(deal),
      ),
    }));
  }, [stages, searchLower, statusMatches, focus, monthBounds]);

  return (
    <div className="space-y-4">
      {/* Desktop kanban - same structure as the real board. */}
      <div className="hidden md:block overflow-x-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredStages.map((s) => `stage:${s.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            <StaggerList className="flex gap-4 min-w-max items-start">
              {filteredStages.map((stage, idx) => (
                <StaggerItem key={stage.id}>
                  <SortableKanbanColumn
                    stage={stage}
                    deals={stage.deals}
                    onStatusChange={handleStatusChange}
                    nextStage={filteredStages[idx + 1] ?? null}
                    onAdvanceStage={handleAdvanceStage}
                    onOpenDeal={(deal) => setPanelDealId(deal.id)}
                  />
                </StaggerItem>
              ))}

              {/* Add-stage affordance - inert in the demo. */}
              <div className="w-72 flex-shrink-0">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors"
                >
                  <Plus size={14} />
                  Add stage
                </button>
              </div>
            </StaggerList>
          </SortableContext>
          <DragOverlay dropAnimation={KANBAN_DROP_ANIMATION}>
            {activeDeal && (
              <div
                className="w-72 rounded-md border border-border bg-background px-3 py-3 shadow-lg opacity-95 transform-gpu"
                style={{ transform: 'scale(1.03) rotate(1deg)' }}
              >
                <div className="flex items-start gap-2">
                  <GripVertical size={14} className="text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">{activeDeal.title}</p>
                    {activeDeal.value != null && (
                      <p
                        className="text-base tabular-nums text-foreground mt-1 leading-none"
                        style={TITLE_FONT}
                      >
                        {formatCurrency(activeDeal.value)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {activeStage && (
              <div className="w-72 rounded-lg border border-border bg-background shadow-md opacity-95 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <GripVertical size={13} className="text-muted-foreground/50 flex-shrink-0 rotate-90" />
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: activeStage.color }}
                  />
                  <span className="font-semibold text-sm truncate">{activeStage.name}</span>
                  <span className="text-[11px] text-muted-foreground bg-muted rounded-md px-2 py-0.5 font-medium tabular-nums">
                    {activeStage.deals.length}
                  </span>
                </div>
                <div className="h-16 rounded-md bg-muted/30 border border-dashed border-border" />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Slide-over deal panel - reused from the real board. */}
      <DealQuickPanel
        deal={
          panelDealId
            ? stages.flatMap((s) => s.deals).find((d) => d.id === panelDealId) ?? null
            : null
        }
        slug="demo"
        stages={stages as DealStage[]}
        open={!!panelDealId}
        onOpenChange={(open) => {
          if (!open) setPanelDealId(null);
        }}
        onStatusChange={handleStatusChange}
        onStageChange={handlePanelStageChange}
      />
    </div>
  );
}
