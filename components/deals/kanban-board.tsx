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
  closestCorners
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { KanbanColumn } from './kanban-column';
import { DealForm } from './deal-form';
import { Button } from '@/components/ui/button';
import { Plus, GripVertical } from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact } from '@prisma/client';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name'> })[];
};

type StageWithDeals = DealStage & { deals: DealWithRelations[] };

interface KanbanBoardProps {
  subdomain: string;
}

export function KanbanBoard({ subdomain }: KanbanBoardProps) {
  const [stages, setStages] = useState<StageWithDeals[]>([]);
  const [contacts, setContacts] = useState<Pick<Contact, 'id' | 'name'>[]>([]);
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<DealWithRelations | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>('');
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const fetchData = useCallback(async () => {
    const [stagesRes, contactsRes] = await Promise.all([
      fetch(`/api/stages?subdomain=${subdomain}`),
      fetch(`/api/contacts?subdomain=${subdomain}`)
    ]);
    if (stagesRes.ok) setStages(await stagesRes.json());
    if (contactsRes.ok) setContacts(await contactsRes.json());
  }, [subdomain]);

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
      (s) => s.id === over.id || s.deals.some((d) => d.id === over.id)
    );

    if (!activeStage || !overStage || activeStage.id === overStage.id) return;

    setStages((prev) =>
      prev.map((stage) => {
        if (stage.id === activeStage.id) {
          return {
            ...stage,
            deals: stage.deals.filter((d) => d.id !== active.id)
          };
        }
        if (stage.id === overStage.id) {
          const activeDeal = activeStage.deals.find((d) => d.id === active.id)!;
          return {
            ...stage,
            deals: [...stage.deals, { ...activeDeal, stageId: overStage.id }]
          };
        }
        return stage;
      })
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDealId(null);
    if (!over) return;

    const targetStage = stages.find(
      (s) => s.id === over.id || s.deals.some((d) => d.id === over.id)
    );
    if (!targetStage) return;

    const targetIndex = targetStage.deals.findIndex((d) => d.id === over.id);
    const newPosition = targetIndex >= 0 ? targetIndex : targetStage.deals.length - 1;

    await fetch('/api/deals/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealId: active.id,
        newStageId: targetStage.id,
        newPosition
      })
    });

    fetchData();
  }

  async function handleAddDeal(data: any) {
    await fetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, subdomain })
    });
    fetchData();
  }

  async function handleEditDeal(data: any) {
    if (!editDeal) return;
    await fetch(`/api/deals/${editDeal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setEditDeal(null);
    fetchData();
  }

  async function handleDeleteDeal(id: string) {
    if (!confirm('Delete this deal?')) return;
    await fetch(`/api/deals/${id}`, { method: 'DELETE' });
    fetchData();
  }

  function openAddDeal(stageId: string) {
    setDefaultStageId(stageId);
    setAddDealOpen(true);
  }

  const allStages = stages as DealStage[];
  const activeDeal = stages.flatMap((s) => s.deals).find((d) => d.id === activeDealId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pipeline</h2>
          <p className="text-muted-foreground text-sm">Track active deals through your leasing stages</p>
        </div>
        <Button onClick={() => { setDefaultStageId(stages[0]?.id ?? ''); setAddDealOpen(true); }}>
          <Plus size={16} className="mr-1.5" />
          Add deal
        </Button>
      </div>

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
            contactIds: editDeal.dealContacts.map((dc) => dc.contactId)
          }}
          title="Edit Deal"
        />
      )}
    </div>
  );
}
