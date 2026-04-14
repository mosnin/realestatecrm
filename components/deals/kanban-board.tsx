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
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    Set<'active' | 'won' | 'lost' | 'on_hold'>
  >(new Set(['active']));
  const { confirm, ConfirmDialog } = useConfirm();

  const [prefsHydrated, setPrefsHydrated] = useState(false);

  // Hydrate status filter from localStorage (SSR-safe).
  useEffect(() => {
    if (typeof window === 'undefined' || !slug) {
      setPrefsHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(`chippi:deals:statusFilter:${slug}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid: Array<'active' | 'won' | 'lost' | 'on_hold'> = [
            'active',
            'won',
            'lost',
            'on_hold',
          ];
          const filtered = parsed.filter((v): v is 'active' | 'won' | 'lost' | 'on_hold' =>
            typeof v === 'string' && (valid as string[]).includes(v),
          );
          setStatusFilter(new Set(filtered));
        }
      }
    } catch {
      // ignore malformed value or storage access errors
    }
    setPrefsHydrated(true);
  }, [slug]);

  // Persist status filter.
  useEffect(() => {
    if (typeof window === 'undefined' || !slug || !prefsHydrated) return;
    try {
      localStorage.setItem(
        `chippi:deals:statusFilter:${slug}`,
        JSON.stringify(Array.from(statusFilter)),
      );
    } catch {
      // quota / storage disabled — ignore.
    }
  }, [slug, statusFilter, prefsHydrated]);

  function toggleStatus(status: 'active' | 'won' | 'lost' | 'on_hold') {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !slug) return;
    try {
      const stored = localStorage.getItem(`chippi:deals:view:${slug}`);
      if (stored === 'kanban' || stored === 'list') setView(stored);
    } catch {
      // localStorage unavailable — ignore.
    }
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined' || !slug || !prefsHydrated) return;
    try {
      localStorage.setItem(`chippi:deals:view:${slug}`, view);
    } catch {
      // quota / storage disabled — ignore.
    }
  }, [slug, view, prefsHydrated]);

  // Stage deletion state: when a stage has deals, we prompt the user to pick
  // a migration target before calling DELETE with ?targetStageId=...
  const [stageDelete, setStageDelete] = useState<{
    stage: DealStage;
    dealCount: number;
    targetStageId: string;
    submitting: boolean;
  } | null>(null);

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
    isDraggingRef.current = activeDealId !== null || activeStageId !== null;
  }, [activeDealId, activeStageId]);

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
    const id = event.active.id.toString();
    if (id.startsWith('stage:')) {
      setActiveStageId(id.slice('stage:'.length));
    } else {
      setActiveDealId(id);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    // Skip deal-over logic when a stage column is being dragged
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
          return { ...stage, deals: [...stage.deals, { ...activeDeal, stageId: overStage.id }] };
        }
        return stage;
      }),
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    // ── Stage column reorder ──
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

      // Optimistic reorder
      const reordered = arrayMove(stages, oldIndex, newIndex);
      setStages(reordered);

      // Persist to server in the background
      const stageIds = reordered.map((s) => s.id);
      try {
        const res = await fetch('/api/stages/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stageIds }),
        });
        if (!res.ok) {
          toast.error('Failed to save stage order');
          // Revert to the original order on failure
          setStages(stages);
        }
      } catch {
        toast.error('Failed to save stage order');
        setStages(stages);
      }
      return;
    }

    // ── Deal card move ──
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

  // Delete a stage. First tries a naive DELETE. If the API responds with
  // `stage-has-deals`, opens a dialog where the user chooses a migration
  // target (another stage of the same pipelineType) and we retry with
  // ?targetStageId=... For an empty stage we still prompt to confirm.
  async function handleDeleteStage(stage: DealStage) {
    const confirmed = await confirm({
      title: `Delete "${stage.name}"?`,
      description:
        'This stage will be removed from the pipeline. Deals in this stage will need to be moved first.',
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/stages/${stage.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Stage deleted');
        fetchData();
        return;
      }
      const body = await res
        .json()
        .catch(() => ({} as { error?: string; dealCount?: number }));
      if (res.status === 400 && body?.error === 'stage-has-deals') {
        // Need to pick a migration target.
        const candidates = stages.filter(
          (s) => s.id !== stage.id && s.pipelineType === stage.pipelineType,
        );
        setStageDelete({
          stage,
          dealCount: Number(body.dealCount ?? 0),
          targetStageId: candidates[0]?.id ?? '',
          submitting: false,
        });
      } else {
        toast.error('Failed to delete stage');
      }
    } catch {
      toast.error('Failed to delete stage');
    }
  }

  async function confirmStageMigrationDelete() {
    if (!stageDelete || !stageDelete.targetStageId) return;
    setStageDelete((prev) => (prev ? { ...prev, submitting: true } : prev));
    try {
      const params = new URLSearchParams({
        targetStageId: stageDelete.targetStageId,
      });
      const res = await fetch(
        `/api/stages/${stageDelete.stage.id}?${params.toString()}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        toast.error('Failed to delete stage');
        setStageDelete((prev) => (prev ? { ...prev, submitting: false } : prev));
        return;
      }
      toast.success(
        `Moved ${stageDelete.dealCount} deal${stageDelete.dealCount === 1 ? '' : 's'} and deleted stage`,
      );
      setStageDelete(null);
      fetchData();
    } catch {
      toast.error('Failed to delete stage');
      setStageDelete((prev) => (prev ? { ...prev, submitting: false } : prev));
    }
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
  const activeStage = activeStageId ? stages.find((s) => s.id === activeStageId) : null;

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
    return stages.map((s) => ({
      ...s,
      deals: s.deals.filter(
        (deal) =>
          statusFilter.has(deal.status as 'active' | 'won' | 'lost' | 'on_hold') &&
          dealMatchesSearch(deal),
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, searchLower, statusFilter]);

  const allDeals = filteredStages.flatMap((s) => s.deals);
  const totalUnfilteredDealCount = stages.reduce(
    (acc, s) => acc + s.deals.length,
    0,
  );
  const hasActiveFilter =
    !!searchLower || statusFilter.size < 4;

  // Inner component so it can use useSortable inside the board's render tree
  function SortableKanbanColumn({ stage, deals }: { stage: StageWithDeals; deals: DealWithRelations[] }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `stage:${stage.id}` });

    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
    };

    return (
      <div ref={setNodeRef} style={style}>
        <KanbanColumn
          stage={stage}
          deals={deals}
          slug={slug}
          onAddDeal={openAddDeal}
          onEditDeal={(deal) => setEditDeal(deal)}
          onDeleteDeal={handleDeleteDeal}
          onDeleteStage={handleDeleteStage}
          onOpenPanel={(deal) => setPanelDeal(deal)}
          onDealCreated={fetchData}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </div>
    );
  }

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
              className="h-8 w-full sm:w-44 rounded-lg border border-border bg-muted/60 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:bg-background transition-colors"
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

          {/* Status filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { value: 'active', label: 'Active' },
                { value: 'won', label: 'Won' },
                { value: 'lost', label: 'Lost' },
                { value: 'on_hold', label: 'On Hold' },
              ] as const
            ).map((opt) => {
              const selected = statusFilter.has(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatus(opt.value)}
                  aria-pressed={selected}
                  className={cn(
                    'h-8 px-2.5 text-xs font-medium rounded-md border transition-colors',
                    selected
                      ? 'bg-secondary text-foreground border-border'
                      : 'bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden bg-card ml-auto">
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

      {statusFilter.size === 0 ? (
        <div className="rounded-lg border border-border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No status selected — pick at least one status above.
          </p>
        </div>
      ) : view === 'kanban' ? (
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
            <SortableContext
              items={filteredStages.map((s) => `stage:${s.id}`)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-4 min-w-max">
                {filteredStages.map((stage) => (
                  <SortableKanbanColumn
                    key={stage.id}
                    stage={stage}
                    deals={stage.deals}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDeal && (
                <div className="w-72 rounded-lg border border-border bg-card px-3.5 py-3 shadow-lg opacity-95 rotate-1">
                  <div className="flex items-center gap-2">
                    <GripVertical size={15} className="text-muted-foreground/50 flex-shrink-0" />
                    <p className="font-semibold text-sm truncate">{activeDeal.title}</p>
                  </div>
                </div>
              )}
              {activeStage && (
                <div className="w-72 rounded-lg border-2 border-border bg-card shadow-xl opacity-90 p-3">
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
                      {hasActiveFilter && totalUnfilteredDealCount > 0 ? (
                        <>
                          <p className="text-sm font-medium text-foreground">No deals match your filters</p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto">
                            Try clearing the search or enabling more status chips above.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">No deals yet</p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-[220px] mx-auto">
                            Add your first deal to start tracking your leasing pipeline.
                          </p>
                        </>
                      )}
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
            commissionRate: editDeal.commissionRate ?? undefined,
            probability: editDeal.probability ?? undefined,
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

      {/* Stage deletion / deal migration dialog */}
      {stageDelete && (() => {
        const candidates = stages.filter(
          (s) =>
            s.id !== stageDelete.stage.id &&
            s.pipelineType === stageDelete.stage.pipelineType,
        );
        const hasCandidates = candidates.length > 0;
        const { submitting, dealCount, targetStageId } = stageDelete;
        // Guard against a previously-picked target being removed (e.g. via
        // realtime sync in another tab) while this dialog is open. If the
        // current selection is no longer a valid candidate, treat the target
        // as unselected so the confirm button stays disabled until the user
        // picks a fresh one.
        const targetIsValidCandidate =
          !!targetStageId && candidates.some((s) => s.id === targetStageId);
        return (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !submitting) setStageDelete(null);
            }}
          >
            <DialogContent
              className="sm:max-w-md"
              onPointerDownOutside={(e) => {
                if (submitting) e.preventDefault();
              }}
              onEscapeKeyDown={(e) => {
                if (submitting) e.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>Delete &quot;{stageDelete.stage.name}&quot;</DialogTitle>
                <DialogDescription>
                  This stage has {dealCount} deal{dealCount === 1 ? '' : 's'}.
                  {hasCandidates
                    ? ' Pick another stage to move them to before deleting.'
                    : ' Create another stage in this pipeline before deleting this one.'}
                </DialogDescription>
              </DialogHeader>

              {hasCandidates ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Move deals to
                  </label>
                  <Select
                    value={targetStageId}
                    onValueChange={(value) =>
                      setStageDelete((prev) =>
                        prev ? { ...prev, targetStageId: value } : prev,
                      )
                    }
                    disabled={submitting}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a stage" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  There are no other stages in this pipeline to move deals to.
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setStageDelete(null)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmStageMigrationDelete}
                  disabled={submitting || !hasCandidates || !targetIsValidCandidate}
                >
                  {submitting ? 'Deleting…' : 'Move deals & delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
