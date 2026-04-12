'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from './kanban-column';
import { DealForm } from './deal-form';
import { DealPanel } from './deal-panel';
import { Button } from '@/components/ui/button';
import { LiquidMetalButton } from '@/components/ui/liquid-metal-button';
import {
  Plus,
  GripVertical,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  MapPin,
  DollarSign,
  Search,
  X,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';
import { formatCurrency as _formatCurrency } from '@/lib/formatting';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRealtime } from '@/hooks/use-realtime';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

type StageWithDeals = DealStage & { deals: DealWithRelations[] };

const PRIORITY_META: Record<string, { label: string; className: string }> = {
  LOW: { label: 'Low', className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400' },
  MEDIUM: { label: 'Medium', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  HIGH: { label: 'High', className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
};

function formatCurrency(n: number | null) {
  if (n == null) return null;
  return _formatCurrency(n);
}

interface KanbanBoardProps {
  slug: string;
  pipelineType: 'rental' | 'buyer';
}

export function KanbanBoard({ slug, pipelineType }: KanbanBoardProps) {
  const [stages, setStages] = useState<StageWithDeals[]>([]);
  const [contacts, setContacts] = useState<Pick<Contact, 'id' | 'name'>[]>([]);
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<DealWithRelations | null>(null);
  const [panelDeal, setPanelDeal] = useState<DealWithRelations | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>('');
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const fetchData = useCallback(async () => {
    const [stagesRes, contactsRes] = await Promise.all([
      fetch(`/api/stages?slug=${slug}&pipelineType=${pipelineType}`),
      fetch(`/api/contacts?slug=${slug}`),
    ]);
    if (stagesRes.ok) setStages(await stagesRes.json());
    if (contactsRes.ok) setContacts(await contactsRes.json());
  }, [slug, pipelineType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Derive spaceId from the first stage (all stages belong to the same space)
  const spaceId = stages[0]?.spaceId ?? null;

  // Track whether a drag is in progress to avoid disrupting the UX with refetches
  const isDraggingRef = useRef(false);
  useEffect(() => {
    isDraggingRef.current = activeDealId !== null;
  }, [activeDealId]);

  // Refetch helper that skips when a drag is in progress.
  // Queues a refetch for when the drag ends via the pendingRefetchRef.
  const pendingRefetchRef = useRef(false);
  const realtimeRefetch = useCallback(() => {
    if (isDraggingRef.current) {
      pendingRefetchRef.current = true;
      return;
    }
    fetchData();
  }, [fetchData]);

  // Subscribe to Deal changes (INSERT / UPDATE / DELETE)
  const handleDealEvent = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const eventType = payload.eventType;

      if (eventType === 'INSERT') {
        // New deal created (possibly from another tab/user) — refetch to get full relations
        realtimeRefetch();
      } else if (eventType === 'UPDATE') {
        const updated = payload.new as Record<string, unknown>;
        // Update the deal in local state directly for snappy cross-tab stage moves
        setStages((prev) => {
          if (isDraggingRef.current) {
            pendingRefetchRef.current = true;
            return prev;
          }
          const dealId = updated.id as string;
          const newStageId = updated.stageId as string;
          const dealExists = prev.some((s) => s.deals.some((d) => d.id === dealId));
          if (!dealExists) {
            // Deal not in local state yet — full refetch needed
            realtimeRefetch();
            return prev;
          }
          return prev.map((stage) => {
            // Remove deal from old stage
            const deal = stage.deals.find((d) => d.id === dealId);
            if (deal && stage.id !== newStageId) {
              return { ...stage, deals: stage.deals.filter((d) => d.id !== dealId) };
            }
            // Add / update deal in new stage
            if (stage.id === newStageId) {
              const existing = stage.deals.find((d) => d.id === dealId);
              if (existing) {
                return {
                  ...stage,
                  deals: stage.deals.map((d) =>
                    d.id === dealId ? { ...d, ...updated, stageId: newStageId } as typeof d : d,
                  ),
                };
              }
              // Deal moved here from another stage — find it across all stages
              const movedDeal = prev.flatMap((s) => s.deals).find((d) => d.id === dealId);
              if (movedDeal) {
                return {
                  ...stage,
                  deals: [...stage.deals, { ...movedDeal, ...updated, stageId: newStageId } as typeof movedDeal],
                };
              }
            }
            return stage;
          });
        });
      } else if (eventType === 'DELETE') {
        const deleted = payload.old as Record<string, unknown>;
        const dealId = deleted.id as string;
        if (!dealId) {
          realtimeRefetch();
          return;
        }
        setStages((prev) =>
          prev.map((stage) => ({
            ...stage,
            deals: stage.deals.filter((d) => d.id !== dealId),
          })),
        );
      }
    },
    [realtimeRefetch],
  );

  useRealtime({
    table: 'Deal',
    event: '*',
    filter: spaceId ? `spaceId=eq.${spaceId}` : undefined,
    onEvent: handleDealEvent,
    enabled: !!spaceId,
  });

  // Subscribe to DealStage changes to keep columns in sync
  const handleStageEvent = useCallback(
    (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      realtimeRefetch();
    },
    [realtimeRefetch],
  );

  useRealtime({
    table: 'DealStage',
    event: '*',
    filter: spaceId ? `spaceId=eq.${spaceId}` : undefined,
    onEvent: handleStageEvent,
    enabled: !!spaceId,
  });

  function findStageForDeal(dealId: string) {
    return stages.find((s) => s.deals.some((d) => d.id === dealId));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDealId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

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
          return { ...stage, deals: [...stage.deals, { ...activeDeal, stageId: overStage.id }] };
        }
        return stage;
      }),
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDealId(null);
    if (!over) return;

    const targetStage = stages.find(
      (s) => s.id === over.id || s.deals.some((d) => d.id === over.id),
    );
    if (!targetStage) return;

    const targetIndex = targetStage.deals.findIndex((d) => d.id === over.id);
    const newPosition = targetIndex >= 0 ? targetIndex : targetStage.deals.length - 1;

    try {
      const res = await fetch('/api/deals/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: active.id, newStageId: targetStage.id, newPosition }),
      });
      if (res.ok) {
        toast.success(`Deal moved to ${targetStage.name}`);
      } else {
        toast.error('Failed to move deal');
      }
    } catch {
      toast.error('Failed to move deal');
    }

    fetchData();
    // Clear any queued realtime refetch since we just refetched
    pendingRefetchRef.current = false;
  }

  async function handleAddDeal(data: any) {
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, slug }),
      });
      if (res.ok) {
        toast.success('Deal created');
      } else {
        toast.error('Failed to create deal');
      }
    } catch {
      toast.error('Failed to create deal');
    }
    fetchData();
  }

  async function handleEditDeal(data: any) {
    if (!editDeal) return;
    try {
      const res = await fetch(`/api/deals/${editDeal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) toast.error('Failed to update deal');
    } catch {
      toast.error('Failed to update deal');
    }
    setEditDeal(null);
    fetchData();
  }

  async function handleDeleteDeal(id: string) {
    const deal = stages.flatMap((s) => s.deals).find((d) => d.id === id);
    const confirmed = await confirm({
      title: 'Delete this deal?',
      description: deal ? `"${deal.title}" will be permanently removed. This cannot be undone.` : 'This deal will be permanently removed.',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/deals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Deal deleted');
      } else {
        toast.error('Failed to delete deal');
      }
    } catch {
      toast.error('Failed to delete deal');
    }
    if (panelDeal?.id === id) setPanelDeal(null);
    fetchData();
  }

  async function handlePanelUpdate(id: string, updates: Partial<Deal>) {
    try {
      const res = await fetch(`/api/deals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) toast.error('Failed to update deal');
    } catch {
      toast.error('Failed to update deal');
    }
    fetchData();
    // Optimistically update panel deal
    setPanelDeal((prev) => prev && prev.id === id ? { ...prev, ...updates } : prev);
  }

  function openAddDeal(stageId: string) {
    setDefaultStageId(stageId);
    setAddDealOpen(true);
  }

  const allStages = stages as DealStage[];
  const activeDeal = stages.flatMap((s) => s.deals).find((d) => d.id === activeDealId);

  const searchLower = searchQuery.toLowerCase().trim();

  function dealMatchesSearch(deal: DealWithRelations) {
    if (!searchLower) return true;
    return (
      deal.title.toLowerCase().includes(searchLower) ||
      (deal.address?.toLowerCase().includes(searchLower) ?? false) ||
      (deal.description?.toLowerCase().includes(searchLower) ?? false) ||
      deal.dealContacts.some((dc) => dc.contact.name.toLowerCase().includes(searchLower))
    );
  }

  const filteredStages = useMemo(() => {
    if (!searchLower) return stages;
    return stages.map((s) => ({
      ...s,
      deals: s.deals.filter(dealMatchesSearch),
    }));
  }, [stages, searchLower]);

  const allDeals = filteredStages.flatMap((s) => s.deals);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Pipeline</h2>
            <p className="text-muted-foreground text-sm hidden sm:block">
              Track active deals through your leasing stages
            </p>
          </div>
          <LiquidMetalButton
            label="Add deal"
            onClick={() => {
              setDefaultStageId(stages[0]?.id ?? '');
              setAddDealOpen(true);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals…"
              className="h-8 w-full sm:w-44 rounded-lg border border-border bg-muted/60 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden bg-card">
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'list'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
              title="Table view"
            >
              <List size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'kanban'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
              title="Board view"
            >
              <LayoutGrid size={15} />
            </button>
          </div>
        </div>
      </div>

      {view === 'kanban' ? (
        <>
        {/* Mobile stacked view */}
        <div className="md:hidden space-y-4">
          {filteredStages.map((stage) => (
            <div key={stage.id} className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 border-b border-border">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-xs font-semibold">{stage.name}</span>
                <span className="text-[11px] text-muted-foreground bg-muted rounded-md px-1.5 py-0.5 ml-auto">{stage.deals.length}</span>
              </div>
              {stage.deals.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground">No deals in this stage</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {stage.deals.map((deal) => {
                    const priorityMeta = PRIORITY_META[deal.priority] ?? PRIORITY_META.MEDIUM;
                    return (
                      <div
                        key={deal.id}
                        className="flex items-center gap-3 px-3 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setPanelDeal(deal)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{deal.title}</p>
                          {deal.address && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <MapPin size={10} />{deal.address}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {deal.value != null && (
                            <span className="text-xs font-medium">{formatCurrency(deal.value)}</span>
                          )}
                          <span className={cn('text-[10px] font-semibold rounded-md px-1.5 py-0.5', priorityMeta.className)}>
                            {priorityMeta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* Desktop kanban view */}
        <div className="hidden md:block overflow-x-auto pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 min-w-max">
              {filteredStages.map((stage) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  deals={stage.deals}
                  onAddDeal={openAddDeal}
                  onEditDeal={(deal) => setEditDeal(deal)}
                  onDeleteDeal={handleDeleteDeal}
                  onOpenPanel={(deal) => setPanelDeal(deal)}
                />
              ))}
            </div>
            <DragOverlay>
              {activeDeal && (
                <div className="w-72 rounded-lg border border-border bg-card px-3.5 py-3 shadow-lg opacity-95 rotate-1">
                  <div className="flex items-center gap-2">
                    <GripVertical size={15} className="text-muted-foreground/50 flex-shrink-0" />
                    <p className="font-semibold text-sm truncate">{activeDeal.title}</p>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
        </>
      ) : (
        /* ── List / table view ── */
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Deal
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Stage
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Value
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Priority
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                    Contacts
                  </th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {allDeals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                        <Briefcase size={20} className="text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No deals yet</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-[220px] mx-auto">
                        Add your first deal to start tracking your leasing pipeline.
                      </p>
                    </td>
                  </tr>
                ) : (
                  allDeals.map((deal) => {
                    const priorityMeta = PRIORITY_META[deal.priority] ?? PRIORITY_META.MEDIUM;
                    const stage = stages.find((s) => s.id === deal.stageId);
                    return (
                      <tr
                        key={deal.id}
                        className="group hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setPanelDeal(deal)}
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{deal.title}</p>
                            {deal.address && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin size={10} />
                                {deal.address}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {stage && (
                            <span className="flex items-center gap-1.5 text-xs">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: stage.color }}
                              />
                              {stage.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs font-medium">
                          {deal.value != null ? (
                            <span className="flex items-center gap-1 text-foreground">
                              {formatCurrency(deal.value)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span
                            className={cn(
                              'inline-flex text-[10px] font-semibold rounded-md px-2 py-0.5',
                              priorityMeta.className,
                            )}
                          >
                            {priorityMeta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                          {deal.dealContacts.length > 0
                            ? deal.dealContacts.map((dc) => dc.contact.name).join(', ')
                            : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEditDeal(deal); }}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteDeal(deal.id); }}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DealForm
        open={addDealOpen}
        onOpenChange={setAddDealOpen}
        onSubmit={handleAddDeal}
        stages={allStages}
        contacts={contacts}
        defaultValues={{ stageId: defaultStageId }}
      />

      {editDeal && (
        <DealForm
          open={!!editDeal}
          onOpenChange={(o) => !o && setEditDeal(null)}
          onSubmit={handleEditDeal}
          stages={allStages}
          contacts={contacts}
          defaultValues={{
            title: editDeal.title,
            description: editDeal.description ?? '',
            value: editDeal.value?.toString() ?? '',
            address: editDeal.address ?? '',
            priority: editDeal.priority as any,
            closeDate: editDeal.closeDate
              ? new Date(editDeal.closeDate).toISOString().split('T')[0]
              : '',
            stageId: editDeal.stageId,
            contactIds: editDeal.dealContacts.map((dc) => dc.contactId),
          }}
          title="Edit Deal"
        />
      )}

      <DealPanel
        deal={panelDeal}
        open={!!panelDeal}
        onClose={() => setPanelDeal(null)}
        onEdit={(deal) => { setPanelDeal(null); setEditDeal(deal); }}
        onUpdate={handlePanelUpdate}
        slug={slug}
      />
      {ConfirmDialog}
    </div>
  );
}
