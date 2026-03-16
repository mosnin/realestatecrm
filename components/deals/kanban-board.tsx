'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Plus,
  GripVertical,
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  MapPin,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';
import { formatCurrency as _formatCurrency } from '@/lib/formatting';

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
}

export function KanbanBoard({ slug }: KanbanBoardProps) {
  const [stages, setStages] = useState<StageWithDeals[]>([]);
  const [contacts, setContacts] = useState<Pick<Contact, 'id' | 'name'>[]>([]);
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<DealWithRelations | null>(null);
  const [panelDeal, setPanelDeal] = useState<DealWithRelations | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>('');
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const fetchData = useCallback(async () => {
    const [stagesRes, contactsRes] = await Promise.all([
      fetch(`/api/stages?slug=${slug}`),
      fetch(`/api/contacts?slug=${slug}`),
    ]);
    if (stagesRes.ok) setStages(await stagesRes.json());
    if (contactsRes.ok) setContacts(await contactsRes.json());
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

    await fetch('/api/deals/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId: active.id, newStageId: targetStage.id, newPosition }),
    });

    fetchData();
  }

  async function handleAddDeal(data: any) {
    await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, slug }),
    });
    fetchData();
  }

  async function handleEditDeal(data: any) {
    if (!editDeal) return;
    await fetch(`/api/deals/${editDeal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setEditDeal(null);
    fetchData();
  }

  async function handleDeleteDeal(id: string) {
    if (!confirm('Delete this deal?')) return;
    await fetch(`/api/deals/${id}`, { method: 'DELETE' });
    if (panelDeal?.id === id) setPanelDeal(null);
    fetchData();
  }

  async function handlePanelUpdate(id: string, updates: Partial<Deal>) {
    await fetch(`/api/deals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
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
  const allDeals = stages.flatMap((s) => s.deals);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline</h2>
          <p className="text-muted-foreground text-sm">
            Track active deals through your leasing stages
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden bg-card">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'kanban'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <List size={15} />
            </button>
          </div>

          <Button
            onClick={() => {
              setDefaultStageId(stages[0]?.id ?? '');
              setAddDealOpen(true);
            }}
          >
            <Plus size={16} className="mr-1.5" />
            Add deal
          </Button>
        </div>
      </div>

      {view === 'kanban' ? (
        <div className="overflow-x-auto pb-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 min-w-max">
              {stages.map((stage) => (
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
                <div className="w-72 rounded-xl border border-primary/30 bg-card px-3.5 py-3 shadow-[0_8px_24px_-8px_rgba(13,148,136,0.35)] opacity-95 rotate-1">
                  <div className="flex items-center gap-2">
                    <GripVertical size={15} className="text-primary/50 flex-shrink-0" />
                    <p className="font-semibold text-sm truncate">{activeDeal.title}</p>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      ) : (
        /* ── List / table view ── */
        <div className="rounded-xl border border-border overflow-hidden">
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
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No deals yet. Add your first deal to get started.
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
                              'inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5',
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
    </div>
  );
}
