'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { KanbanColumn } from './kanban-column';
import { Button } from '@/components/ui/button';
import { DealQuickPanel } from './deal-quick-panel';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import {
  Plus,
  GripVertical,
  LayoutGrid,
  List,
  Trash2,
  MapPin,
  Search,
  X,
  Briefcase,
  Trophy,
  XCircle,
  SlidersHorizontal,
  Download,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check,
  Palette,
  ArrowRight,
} from 'lucide-react';
import {
  SECTION_LABEL,
  TITLE_FONT,
} from '@/lib/typography';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
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

interface SortableKanbanColumnProps {
  stage: StageWithDeals;
  deals: DealWithRelations[];
  slug: string;
  onAddDeal: (stageId: string) => void;
  onDeleteDeal: (id: string) => void;
  onDeleteStage: (stage: DealStage) => void;
  onDealCreated: () => void;
  onStatusChange: (deal: DealWithRelations, status: 'won' | 'lost' | 'on_hold' | 'active') => void;
  nextStage?: DealStage | null;
  onAdvanceStage?: (deal: DealWithRelations, nextStageId: string) => void;
  onOpenDeal?: (deal: DealWithRelations) => void;
}

function SortableKanbanColumn({
  stage,
  deals,
  slug,
  onAddDeal,
  onDeleteDeal,
  onDeleteStage,
  onDealCreated,
  onStatusChange,
  nextStage,
  onAdvanceStage,
  onOpenDeal,
}: SortableKanbanColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `stage:${stage.id}` });

  // Observe the global DnD state so we can highlight this column as a drop
  // target when a deal card is hovering over it. We explicitly ignore the
  // stage-column reorder drag (ids that start with `stage:`) — the highlight
  // is only meaningful for card drops.
  const { active, over } = useDndContext();
  const activeId = active?.id?.toString() ?? null;
  const overId = over?.id?.toString() ?? null;
  const isDealDrag = !!activeId && !activeId.startsWith('stage:');
  const overMatchesStage =
    !!overId &&
    (overId === stage.id || deals.some((d) => d.id === overId));
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
        // Restrained drop indicator — paper-flat, no bright accent.
        isDropTarget && 'bg-foreground/[0.04]',
      )}
    >
      <KanbanColumn
        stage={stage}
        deals={deals}
        slug={slug}
        onAddDeal={onAddDeal}
        onDeleteDeal={onDeleteDeal}
        onDeleteStage={onDeleteStage}
        onDealCreated={onDealCreated}
        onStatusChange={onStatusChange}
        nextStage={nextStage}
        onAdvanceStage={onAdvanceStage}
        onOpenDeal={onOpenDeal}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function formatCurrency(n: number | null) {
  if (n == null) return null;
  return _formatCurrency(n);
}

/**
 * Pulls a human-readable error message from a failed API response.
 * Routes in this app return `{ error: string }` on non-2xx. Falls back to
 * the HTTP status text, then a generic label, if the body is empty/malformed.
 */
async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.clone().json();
    if (data && typeof data.error === 'string' && data.error.trim()) {
      return data.error.trim();
    }
    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
  } catch {
    // fall through to status-based message
  }
  return res.statusText || `Request failed (${res.status})`;
}

const NETWORK_ERROR_MSG = 'lost the connection';

interface KanbanBoardProps {
  slug: string;
  pipelineId: string;
}

export function KanbanBoard({ slug, pipelineId }: KanbanBoardProps) {
  const router = useRouter();
  const [stages, setStages] = useState<StageWithDeals[]>([]);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [view, setView] = useState<'kanban' | 'list'>('list');
  // Force list view on mobile (< md). Stored preference is preserved so
  // desktop kanban resumes when the viewport widens.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  const effectiveView: 'kanban' | 'list' = isMobile ? 'list' : view;
  const [searchQuery, setSearchQuery] = useState('');
  // Slide-over panel state — clicking a card opens the deal here without nav.
  const [panelDealId, setPanelDealId] = useState<string | null>(null);
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
    // Clear bulk selection when switching views
    setSelectedDealIds(new Set());
  }, [slug, view, prefsHydrated]);

  // Won / Lost reason dialog (triggered from card quick-action buttons)
  const WON_REASONS = ['Full price offer', 'Great negotiation', 'Client referral', 'Other'] as const;
  const LOST_REASONS = ['Price too high', 'Chose another agent', 'Deal fell through', 'Financing issue', 'Other'] as const;

  const [wonLostDialog, setWonLostDialog] = useState<{
    deal: DealWithRelations;
    status: 'won' | 'lost';
  } | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  const [statusChangePending, setStatusChangePending] = useState(false);

  // Advanced filters
  const [filterPriority, setFilterPriority] = useState<Set<'LOW' | 'MEDIUM' | 'HIGH'>>(
    new Set(['LOW', 'MEDIUM', 'HIGH']),
  );
  const [filterValueMin, setFilterValueMin] = useState('');
  const [filterValueMax, setFilterValueMax] = useState('');
  const [filterProbMin, setFilterProbMin] = useState('');
  const [filterProbMax, setFilterProbMax] = useState('');

  // Sort state (list view)
  const [sortField, setSortField] = useState<
    'title' | 'value' | 'priority' | 'probability' | 'closeDate' | 'stage' | null
  >(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Bulk selection (list view)
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [bulkStagePicker, setBulkStagePicker] = useState(false);
  const [bulkStageTarget, setBulkStageTarget] = useState('');
  const [bulkPending, setBulkPending] = useState(false);

  // Inline "Add Stage" state for the kanban view
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('#6b7280');
  const [addingStageSubmitting, setAddingStageSubmitting] = useState(false);
  const newStageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingStage && newStageRef.current) newStageRef.current.focus();
  }, [addingStage]);

  async function handleAddStage() {
    const name = newStageName.trim();
    if (!name) return;
    setAddingStageSubmitting(true);
    try {
      const res = await fetch('/api/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name, color: newStageColor, pipelineId }),
      });
      if (!res.ok) {
        const detail = await parseApiError(res);
        toast.error(`Couldn't create stage: ${detail}`);
        return;
      }
      setAddingStage(false);
      setNewStageName('');
      setNewStageColor('#6b7280');
      fetchData();
    } catch {
      toast.error(`Couldn't create stage: ${NETWORK_ERROR_MSG}`);
    } finally {
      setAddingStageSubmitting(false);
    }
  }

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
    const res = await fetch(`/api/stages?slug=${encodeURIComponent(slug)}&pipelineId=${encodeURIComponent(pipelineId)}`);
    if (res.ok) setStages(await res.json());
  }, [slug, pipelineId]);

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

      // Capture the pre-reorder state for rollback before the optimistic update.
      const previousStages = stages;

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
          const detail = await parseApiError(res);
          toast.error(`Couldn't save stage order: ${detail}`);
          // Revert to the original order on failure
          setStages(previousStages);
        }
      } catch {
        toast.error(`Couldn't save stage order: ${NETWORK_ERROR_MSG}`);
        setStages(previousStages);
      } finally {
        // Flush any realtime refetch that was queued during the drag
        if (pendingRefetchRef.current) {
          pendingRefetchRef.current = false;
          fetchData();
        }
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

    // Capture the dragged deal's title up-front so the success toast can
    // reference it even if `fetchData()` replaces the reference mid-flight.
    const draggedDeal = targetStage.deals.find((d) => d.id === active.id)
      ?? stages.flatMap((s) => s.deals).find((d) => d.id === active.id);
    const dealTitle = draggedDeal?.title ?? 'Deal';

    const targetIndex = targetStage.deals.findIndex((d) => d.id === over.id);
    // When dropped onto the column droppable (not onto a deal), targetIndex is -1.
    // In that case place at end. After handleDragOver the dragged deal is already in
    // targetStage.deals, so length - 1 gives the last (0-based) index.
    // Math.max(0, …) ensures we never send a negative position to the API.
    const newPosition = targetIndex >= 0 ? targetIndex : Math.max(0, targetStage.deals.length - 1);

    try {
      const res = await fetch('/api/deals/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: active.id, newStageId: targetStage.id, newPosition }),
      });
      if (res.ok) {
        toast.success(`Moved "${dealTitle}" → ${targetStage.name}.`);
      } else {
        const detail = await parseApiError(res);
        toast.error(`Couldn't move deal: ${detail}`);
      }
    } catch {
      toast.error(`Couldn't move deal: ${NETWORK_ERROR_MSG}`);
    } finally {
      fetchData();
      // Clear any queued realtime refetch since we just refetched
      pendingRefetchRef.current = false;
    }
  }

  async function handleDeleteDeal(id: string) {
    const deal = stages.flatMap((s) => s.deals).find((d) => d.id === id);
    const confirmed = await confirm({
      title: 'Delete this deal?',
      description: deal ? `"${deal.title}" will be gone. I can't bring it back.` : "This deal will be gone. I can't bring it back.",
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/deals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Deal deleted.');
      } else {
        const detail = await parseApiError(res);
        toast.error(`Couldn't delete deal: ${detail}`);
      }
    } catch {
      toast.error(`Couldn't delete deal: ${NETWORK_ERROR_MSG}`);
    }
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
        "I'll remove this stage from the pipeline. Move any deals out first.",
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/stages/${stage.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Stage deleted.');
        fetchData();
        return;
      }
      const body = await res
        .json()
        .catch(() => ({} as { error?: string; dealCount?: number }));
      if (res.status === 400 && body?.error === 'stage-has-deals') {
        // Need to pick a migration target.
        const candidates = stages.filter((s) => s.id !== stage.id);
        setStageDelete({
          stage,
          dealCount: Number(body.dealCount ?? 0),
          targetStageId: candidates[0]?.id ?? '',
          submitting: false,
        });
      } else {
        const detail =
          (typeof body?.error === 'string' && body.error.trim())
            ? body.error.trim()
            : res.statusText || `Request failed (${res.status})`;
        toast.error(`Couldn't delete stage: ${detail}`);
      }
    } catch {
      toast.error(`Couldn't delete stage: ${NETWORK_ERROR_MSG}`);
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
        const detail = await parseApiError(res);
        toast.error(`Couldn't delete stage: ${detail}`);
        setStageDelete((prev) => (prev ? { ...prev, submitting: false } : prev));
        return;
      }
      toast.success(
        `Moved ${stageDelete.dealCount} deal${stageDelete.dealCount === 1 ? '' : 's'} and deleted the stage.`,
      );
      setStageDelete(null);
      fetchData();
    } catch {
      toast.error(`Couldn't delete stage: ${NETWORK_ERROR_MSG}`);
      setStageDelete((prev) => (prev ? { ...prev, submitting: false } : prev));
    }
  }

  function handleCardStatusChange(deal: DealWithRelations, status: 'won' | 'lost' | 'on_hold' | 'active') {
    if (status === 'won' || status === 'lost') {
      setSelectedReason(null);
      setReasonNote('');
      setWonLostDialog({ deal, status });
      return;
    }
    // on_hold and active: fire immediately, no dialog needed
    applyStatusChange(deal, status, undefined, undefined);
  }

  async function applyStatusChange(
    deal: DealWithRelations,
    status: 'won' | 'lost' | 'on_hold' | 'active',
    wonLostReason?: string,
    wonLostNote?: string,
  ) {
    setStatusChangePending(true);
    // Optimistic update
    setStages((prev) =>
      prev.map((s) => ({
        ...s,
        deals: s.deals.map((d) =>
          d.id === deal.id ? { ...d, status } : d,
        ),
      })),
    );
    try {
      const body: Record<string, unknown> = { slug, status };
      if (wonLostReason) body.wonLostReason = wonLostReason;
      if (wonLostNote) body.wonLostNote = wonLostNote;
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await parseApiError(res);
        toast.error(`Couldn't update status: ${detail}`);
        // Roll back optimistic update
        fetchData();
      } else {
        const labelMap: Record<string, string> = {
          won: 'Won',
          lost: 'Lost',
          on_hold: 'On Hold',
          active: 'Active',
        };
        toast.success(`Deal marked as ${labelMap[status]}.`);
        fetchData();
      }
    } catch {
      toast.error(`Couldn't update status: ${NETWORK_ERROR_MSG}`);
      fetchData();
    } finally {
      setStatusChangePending(false);
    }
  }

  async function handleWonLostConfirm() {
    if (!wonLostDialog || !selectedReason) return;
    const { deal, status } = wonLostDialog;
    setWonLostDialog(null);
    await applyStatusChange(deal, status, selectedReason, reasonNote.trim() || undefined);
  }

  function openAddDeal(stageId: string) {
    router.push(`/s/${slug}/deals/new?stageId=${stageId}`);
  }

  /**
   * Open the slide-over panel for a deal. The panel stays in sync with the
   * board because we look the deal up by id from current state on every render.
   */
  function handleOpenDeal(deal: DealWithRelations) {
    setPanelDealId(deal.id);
  }

  /**
   * Stage change from the slide-over. Routes through the same reorder
   * endpoint the kanban drag handler uses so server-side position rebalancing
   * stays consistent. Optimistically moves the card.
   */
  async function handlePanelStageChange(dealId: string, newStageId: string) {
    const currentStage = stages.find((s) => s.deals.some((d) => d.id === dealId));
    const newStage = stages.find((s) => s.id === newStageId);
    if (!currentStage || !newStage || currentStage.id === newStageId) return;

    const deal = currentStage.deals.find((d) => d.id === dealId);
    if (!deal) return;

    // Optimistic move
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

    try {
      const newPosition = newStage.deals.length;
      const res = await fetch('/api/deals/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, newStageId, newPosition }),
      });
      if (res.ok) {
        toast.success(`Moved to ${newStage.name}.`);
      } else {
        const detail = await parseApiError(res);
        toast.error(`Couldn't move deal: ${detail}`);
      }
    } catch {
      toast.error(`Couldn't move deal: ${NETWORK_ERROR_MSG}`);
    } finally {
      fetchData();
      pendingRefetchRef.current = false;
    }
  }

  /**
   * Advance a deal to the next stage. Uses the same reorder endpoint the drag
   * handler uses so the server-side position rebalancing stays consistent.
   * Optimistically moves the card, toasts on success/failure.
   */
  async function handleAdvanceStage(deal: DealWithRelations, nextStageId: string) {
    const nextStage = stages.find((s) => s.id === nextStageId);
    if (!nextStage) return;

    // Optimistic move — pop from current stage, append to next stage.
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === deal.stageId) {
          return { ...s, deals: s.deals.filter((d) => d.id !== deal.id) };
        }
        if (s.id === nextStageId) {
          return { ...s, deals: [...s.deals, { ...deal, stageId: nextStageId, stage: nextStage }] };
        }
        return s;
      }),
    );

    try {
      const newPosition = nextStage.deals.length;
      const res = await fetch('/api/deals/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: deal.id, newStageId: nextStageId, newPosition }),
      });
      if (res.ok) {
        toast.success(`Advanced to ${nextStage.name}.`);
      } else {
        const detail = await parseApiError(res);
        toast.error(`Couldn't advance deal: ${detail}`);
      }
    } catch {
      toast.error(`Couldn't advance deal: ${NETWORK_ERROR_MSG}`);
    } finally {
      fetchData();
      pendingRefetchRef.current = false;
    }
  }

  // CSV export
  function exportCSV() {
    const headers = ['Title', 'Stage', 'Status', 'Value', 'Commission Rate', 'Probability', 'Priority', 'Address', 'People', 'Close Date', 'Follow Up', 'Created'];
    const rows = allDeals.map((deal) => {
      const stage = stages.find((s) => s.id === deal.stageId);
      const contacts = deal.dealContacts.map((dc) => dc.contact.name).join('; ');
      const closeDate = deal.closeDate ? new Date(deal.closeDate as unknown as string).toLocaleDateString() : '';
      const followUp = deal.followUpAt ? new Date(deal.followUpAt as unknown as string).toLocaleDateString() : '';
      const created = new Date(deal.createdAt as unknown as string).toLocaleDateString();
      return [deal.title, stage?.name ?? '', deal.status, deal.value != null ? String(deal.value) : '', deal.commissionRate != null ? `${deal.commissionRate}%` : '', deal.probability != null ? `${deal.probability}%` : '', deal.priority, deal.address ?? '', contacts, closeDate, followUp, created]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Duplicate deal
  async function handleDuplicateDeal(deal: DealWithRelations) {
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title: `${deal.title} (copy)`,
          description: deal.description,
          value: deal.value,
          commissionRate: deal.commissionRate,
          probability: deal.probability,
          address: deal.address,
          priority: deal.priority,
          closeDate: deal.closeDate,
          stageId: deal.stageId,
          contactIds: deal.dealContacts.map((dc) => dc.contactId),
        }),
      });
      if (!res.ok) {
        const detail = await parseApiError(res);
        toast.error(`Couldn't duplicate deal: ${detail}`);
        return;
      }
      const newDeal = await res.json();
      toast.success('Deal duplicated.');
      router.push(`/s/${slug}/deals/${newDeal.id}`);
    } catch {
      toast.error(`Couldn't duplicate deal: ${NETWORK_ERROR_MSG}`);
    }
  }

  // Bulk selection helpers
  function toggleDealSelect(id: string) {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedDealIds.size === allDeals.length && allDeals.length > 0) {
      setSelectedDealIds(new Set());
    } else {
      setSelectedDealIds(new Set(allDeals.map((d) => d.id)));
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selectedDealIds);
    const confirmed = await confirm({
      title: `Delete ${ids.length} deal${ids.length === 1 ? '' : 's'}?`,
      description: "These will be gone. I can't bring them back.",
    });
    if (!confirmed) return;
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/deals/${id}`, { method: 'DELETE' })),
      );

      // Count network-level rejections separately from API-level failures so
      // we can surface a useful detail in the error toast.
      let networkFailures = 0;
      const apiErrors: string[] = [];
      for (const r of results) {
        if (r.status === 'rejected') {
          networkFailures += 1;
          continue;
        }
        if (!r.value.ok) {
          apiErrors.push(await parseApiError(r.value));
        }
      }

      const failed = networkFailures + apiErrors.length;
      if (failed === 0) {
        toast.success(`Deleted ${ids.length} deal${ids.length === 1 ? '' : 's'}.`);
        setSelectedDealIds(new Set());
      } else if (failed === ids.length) {
        const detail = networkFailures === ids.length
          ? NETWORK_ERROR_MSG
          : apiErrors[0] ?? 'Unknown error';
        toast.error(`Couldn't delete deals: ${detail}`);
      } else {
        const succeeded = ids.length - failed;
        const detail = apiErrors[0] ?? NETWORK_ERROR_MSG;
        toast.error(
          `Deleted ${succeeded} of ${ids.length}; ${failed} failed: ${detail}`,
        );
      }
      fetchData();
    } catch {
      toast.error(`Couldn't delete deals: ${NETWORK_ERROR_MSG}`);
    } finally {
      setBulkPending(false);
    }
  }

  async function bulkMoveToStage() {
    if (!bulkStageTarget) return;
    const ids = Array.from(selectedDealIds);
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/deals/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, stageId: bulkStageTarget }),
          }),
        ),
      );

      // Distinguish network-level rejections from API-level failures so the
      // error toast can point the realtor at an actionable cause.
      let networkFailures = 0;
      const apiErrors: string[] = [];
      for (const r of results) {
        if (r.status === 'rejected') {
          networkFailures += 1;
          continue;
        }
        if (!r.value.ok) {
          apiErrors.push(await parseApiError(r.value));
        }
      }

      const stageName = stages.find((s) => s.id === bulkStageTarget)?.name ?? '';
      const failed = networkFailures + apiErrors.length;
      if (failed === 0) {
        toast.success(`Moved ${ids.length} deal${ids.length === 1 ? '' : 's'} to ${stageName}.`);
        setBulkStagePicker(false);
        setBulkStageTarget('');
        setSelectedDealIds(new Set());
      } else if (failed === ids.length) {
        const detail = networkFailures === ids.length
          ? NETWORK_ERROR_MSG
          : apiErrors[0] ?? 'Unknown error';
        toast.error(`Couldn't move deals: ${detail}`);
      } else {
        const succeeded = ids.length - failed;
        const detail = apiErrors[0] ?? NETWORK_ERROR_MSG;
        toast.error(
          `Moved ${succeeded} of ${ids.length} to ${stageName}; ${failed} failed: ${detail}`,
        );
      }
      fetchData();
    } catch {
      toast.error(`Couldn't move deals: ${NETWORK_ERROR_MSG}`);
    } finally {
      setBulkPending(false);
    }
  }

  // Sortable column header
  function SortHeader({ field, label, className }: { field: NonNullable<typeof sortField>; label: string; className?: string }) {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => {
          if (isActive) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          else { setSortField(field); setSortDir('asc'); }
        }}
        className={cn('flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors group', className)}
      >
        {label}
        {isActive ? (
          sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
        ) : (
          <ArrowUpDown size={11} className="opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>
    );
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
    const valueMinN = filterValueMin !== '' ? parseFloat(filterValueMin) : null;
    const valueMaxN = filterValueMax !== '' ? parseFloat(filterValueMax) : null;
    const probMinN = filterProbMin !== '' ? parseInt(filterProbMin, 10) : null;
    const probMaxN = filterProbMax !== '' ? parseInt(filterProbMax, 10) : null;
    return stages.map((s) => ({
      ...s,
      deals: s.deals.filter((deal) => {
        if (!statusFilter.has(deal.status as 'active' | 'won' | 'lost' | 'on_hold')) return false;
        if (!dealMatchesSearch(deal)) return false;
        if (!filterPriority.has(deal.priority as 'LOW' | 'MEDIUM' | 'HIGH')) return false;
        if (valueMinN !== null && (deal.value == null || deal.value < valueMinN)) return false;
        if (valueMaxN !== null && (deal.value == null || deal.value > valueMaxN)) return false;
        if (probMinN !== null && (deal.probability == null || deal.probability < probMinN)) return false;
        if (probMaxN !== null && (deal.probability == null || deal.probability > probMaxN)) return false;
        return true;
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, searchLower, statusFilter, filterPriority, filterValueMin, filterValueMax, filterProbMin, filterProbMax]);

  const PRIORITY_ORDER: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

  const allDeals = useMemo(() => {
    const deals = filteredStages.flatMap((s) => s.deals);
    if (!sortField) return deals;
    return [...deals].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title);
      } else if (sortField === 'value') {
        cmp = (a.value ?? -1) - (b.value ?? -1);
      } else if (sortField === 'priority') {
        cmp = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
      } else if (sortField === 'probability') {
        cmp = (a.probability ?? -1) - (b.probability ?? -1);
      } else if (sortField === 'closeDate') {
        const aD = a.closeDate ? new Date(a.closeDate as unknown as string).getTime() : Infinity;
        const bD = b.closeDate ? new Date(b.closeDate as unknown as string).getTime() : Infinity;
        cmp = aD - bD;
      } else if (sortField === 'stage') {
        const aStage = stages.find((s) => s.id === a.stageId);
        const bStage = stages.find((s) => s.id === b.stageId);
        cmp = (aStage?.position ?? 0) - (bStage?.position ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredStages, sortField, sortDir, stages]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalUnfilteredDealCount = stages.reduce((acc, s) => acc + s.deals.length, 0);

  const advancedFilterCount =
    (filterPriority.size < 3 ? 1 : 0) +
    (filterValueMin !== '' || filterValueMax !== '' ? 1 : 0) +
    (filterProbMin !== '' || filterProbMax !== '' ? 1 : 0);

  const hasActiveFilter = !!searchLower || statusFilter.size < 4 || advancedFilterCount > 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter chips — Active / Won / Lost / On Hold */}
          <div className="flex items-center gap-1 flex-wrap">
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
                    'inline-flex items-center rounded-full px-3 h-8 sm:h-7 text-xs font-medium transition-colors duration-150',
                    selected
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative ml-auto flex-1 sm:flex-initial min-w-[140px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deals…"
              className="pl-9 pr-7 h-9 w-full sm:w-56 text-sm rounded-md border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-150"
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

          {/* Advanced filter popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium transition-colors duration-150',
                  advancedFilterCount > 0
                    ? 'text-foreground bg-foreground/[0.045]'
                    : 'text-foreground hover:bg-foreground/[0.04]',
                )}
              >
                <SlidersHorizontal size={13} />
                Filters
                {advancedFilterCount > 0 && (
                  <span className="ml-0.5 bg-foreground/[0.08] rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-semibold tabular-nums">
                    {advancedFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-4 space-y-4">
              {/* Priority filter */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Priority</p>
                <div className="flex gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => {
                    const on = filterPriority.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setFilterPriority((prev) => {
                            const next = new Set(prev);
                            if (next.has(p)) next.delete(p); else next.add(p);
                            return next;
                          })
                        }
                        className={cn(
                          'flex-1 h-8 sm:h-7 text-xs font-medium rounded-md border transition-colors',
                          on
                            ? p === 'LOW'
                              ? 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40'
                              : p === 'MEDIUM'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                              : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40'
                            : 'bg-transparent text-muted-foreground border-border hover:bg-muted',
                        )}
                      >
                        {p === 'LOW' ? 'Low' : p === 'MEDIUM' ? 'Medium' : 'High'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Value range */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deal Value</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={filterValueMin}
                    onChange={(e) => setFilterValueMin(e.target.value)}
                    placeholder="Min"
                    className="h-8 sm:h-7 w-full rounded-md border border-border bg-muted/50 px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-muted-foreground text-xs flex-shrink-0">to</span>
                  <input
                    type="number"
                    min={0}
                    value={filterValueMax}
                    onChange={(e) => setFilterValueMax(e.target.value)}
                    placeholder="Max"
                    className="h-8 sm:h-7 w-full rounded-md border border-border bg-muted/50 px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Probability range */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Win Probability (%)</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={filterProbMin}
                    onChange={(e) => setFilterProbMin(e.target.value)}
                    placeholder="Min"
                    className="h-8 sm:h-7 w-full rounded-md border border-border bg-muted/50 px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-muted-foreground text-xs flex-shrink-0">to</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={filterProbMax}
                    onChange={(e) => setFilterProbMax(e.target.value)}
                    placeholder="Max"
                    className="h-8 sm:h-7 w-full rounded-md border border-border bg-muted/50 px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              {/* Reset */}
              {advancedFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterPriority(new Set(['LOW', 'MEDIUM', 'HIGH']));
                    setFilterValueMin('');
                    setFilterValueMax('');
                    setFilterProbMin('');
                    setFilterProbMax('');
                  }}
                  className="w-full h-8 sm:h-7 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted transition-colors"
                >
                  Reset filters
                </button>
              )}
            </PopoverContent>
          </Popover>

          {/* Export CSV — hidden on mobile to keep toolbar from wrapping */}
          <button
            type="button"
            onClick={exportCSV}
            disabled={allDeals.length === 0}
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export to CSV"
          >
            <Download size={13} />
            Export
          </button>

          {/* View toggle — segmented control */}
          <div className="flex items-center gap-0.5 rounded-md border border-border/70 bg-background p-0.5">
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'h-8 sm:h-7 w-8 flex items-center justify-center rounded transition-colors duration-150',
                view === 'list'
                  ? 'bg-foreground/[0.045] text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="List view"
              aria-label="List view"
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={cn(
                'h-8 sm:h-7 w-8 flex items-center justify-center rounded transition-colors duration-150',
                view === 'kanban'
                  ? 'bg-foreground/[0.045] text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title="Board view"
              aria-label="Board view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedDealIds.size > 0 && effectiveView === 'list' && (
        <div className="flex items-center gap-3 flex-wrap rounded-md border border-border/70 bg-foreground/[0.02] px-4 py-2.5">
          <span className="text-sm text-foreground tabular-nums">
            {selectedDealIds.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button
              type="button"
              onClick={() => {
                setBulkStageTarget(stages[0]?.id ?? '');
                setBulkStagePicker(true);
              }}
              disabled={bulkPending}
              className="h-7 px-3 flex items-center gap-1.5 text-xs font-medium rounded-md border border-border/70 bg-background hover:bg-foreground/[0.04] transition-colors duration-150 disabled:opacity-50"
            >
              Move to stage
              <ChevronDown size={11} />
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={bulkPending}
              className="h-7 px-3 text-xs font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 disabled:opacity-50"
            >
              {bulkPending ? 'Working…' : 'Delete'}
            </button>
            <button
              type="button"
              onClick={() => setSelectedDealIds(new Set())}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150"
              aria-label="Clear selection"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {statusFilter.size === 0 ? (
        <div className="rounded-xl border border-border/70 bg-background px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Pick at least one status above to see deals.
          </p>
        </div>
      ) : effectiveView === 'kanban' ? (
        <>
        {/* Mobile stacked view — paper-flat hairline rows. */}
        <div className="md:hidden space-y-4">
          {filteredStages.map((stage) => (
            <div key={stage.id} className="rounded-xl border border-border/70 bg-background overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-foreground/[0.02] border-b border-border/70">
                <span className="text-sm font-semibold text-foreground">{stage.name}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">{stage.deals.length}</span>
              </div>
              {stage.deals.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <p className="text-xs text-muted-foreground">Nothing in this stage yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/70">
                  {stage.deals.map((deal) => (
                    <div
                      key={deal.id}
                      className="flex items-center gap-3 px-3 py-3 hover:bg-foreground/[0.04] transition-colors duration-150 cursor-pointer"
                      onClick={() => setPanelDealId(deal.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">{deal.title}</p>
                        {deal.address && (
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <MapPin size={10} />{deal.address}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {deal.value != null && (
                          <span
                            className="text-sm tabular-nums text-foreground"
                            style={TITLE_FONT}
                          >
                            {formatCurrency(deal.value)}
                          </span>
                        )}
                        <ArrowRight size={12} className="text-muted-foreground/50" />
                      </div>
                    </div>
                  ))}
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
              <StaggerList className="flex gap-4 min-w-max items-start">
                {filteredStages.map((stage, idx) => (
                  <StaggerItem key={stage.id}>
                    <SortableKanbanColumn
                      stage={stage}
                      deals={stage.deals}
                      slug={slug}
                      onAddDeal={openAddDeal}
                      onDeleteDeal={handleDeleteDeal}
                      onDeleteStage={handleDeleteStage}
                      onDealCreated={fetchData}
                      onStatusChange={handleCardStatusChange}
                      nextStage={filteredStages[idx + 1] ?? null}
                      onAdvanceStage={handleAdvanceStage}
                      onOpenDeal={handleOpenDeal}
                    />
                  </StaggerItem>
                ))}

                {/* Inline "Add Stage" card */}
                <div className="w-72 flex-shrink-0">
                  {addingStage ? (
                    <div className="rounded-lg border border-primary bg-card p-3 space-y-2.5">
                      <input
                        ref={newStageRef}
                        value={newStageName}
                        onChange={(e) => setNewStageName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddStage();
                          if (e.key === 'Escape') { setAddingStage(false); setNewStageName(''); }
                        }}
                        placeholder="Stage name…"
                        disabled={addingStageSubmitting}
                        className="w-full text-sm bg-muted/50 border border-border rounded-md px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ring"
                        maxLength={100}
                      />
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-border"
                                style={{ backgroundColor: newStageColor }}
                              />
                              <Palette size={11} />
                              Color
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-44 p-2">
                            <div className="grid grid-cols-6 gap-1.5">
                              {['#6b7280','#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6','#78716c'].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setNewStageColor(c)}
                                  className="w-6 h-6 rounded-md transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring"
                                  style={{ backgroundColor: c }}
                                  aria-label={c}
                                >
                                  {c === newStageColor && <Check size={10} className="text-white mx-auto" />}
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            onClick={handleAddStage}
                            disabled={!newStageName.trim() || addingStageSubmitting}
                            className="h-6 px-2.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                          >
                            {addingStageSubmitting ? 'Adding…' : 'Add'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setAddingStage(false); setNewStageName(''); }}
                            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingStage(true)}
                      className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30 transition-colors"
                    >
                      <Plus size={14} />
                      Add stage
                    </button>
                  )}
                </div>
              </StaggerList>
            </SortableContext>
            <DragOverlay>
              {activeDeal && (
                <div className="w-72 rounded-md border border-border bg-background px-3 py-3 shadow-md opacity-95">
                  <div className="flex items-center gap-2">
                    <GripVertical size={14} className="text-muted-foreground/40 flex-shrink-0" />
                    <p className="text-sm font-medium truncate text-foreground">{activeDeal.title}</p>
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
        </>
      ) : (
        /* ── List / table view ── */
        <div className="rounded-xl border border-border/70 bg-background overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-foreground/[0.02]">
                  <th className="px-3 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allDeals.length > 0 && selectedDealIds.size === allDeals.length}
                      ref={(el) => {
                        if (el) el.indeterminate = selectedDealIds.size > 0 && selectedDealIds.size < allDeals.length;
                      }}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded border-border cursor-pointer accent-foreground"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left px-4 py-2.5">
                    <SortHeader field="title" label="Deal" />
                  </th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">
                    <SortHeader field="stage" label="Stage" />
                  </th>
                  <th className="text-right px-4 py-2.5 hidden md:table-cell">
                    <SortHeader field="value" label="Value" className="ml-auto" />
                  </th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">
                    <SortHeader field="closeDate" label="Close" />
                  </th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">
                    <span className={SECTION_LABEL}>Last activity</span>
                  </th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {allDeals.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4">
                      {hasActiveFilter && totalUnfilteredDealCount > 0 ? (
                        <EmptyState
                          icon={Briefcase}
                          title="Nothing matches those filters."
                          description="Clear the search or widen the status above."
                          variant="flush"
                          size="md"
                        />
                      ) : (
                        <EmptyState
                          icon={Briefcase}
                          title="No deals yet."
                          description="Add the first one and I'll start tracking the pipeline."
                          variant="flush"
                          size="md"
                        />
                      )}
                    </td>
                  </tr>
                ) : (
                  allDeals.map((deal) => {
                    const stage = stages.find((s) => s.id === deal.stageId);
                    const isSelected = selectedDealIds.has(deal.id);
                    const lastActivity = deal.updatedAt
                      ? (() => {
                          const d = new Date(deal.updatedAt as unknown as string);
                          const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000);
                          if (diffDays === 0) return 'today';
                          if (diffDays < 30) return `${diffDays}d ago`;
                          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        })()
                      : '—';
                    const closeLabel = deal.closeDate
                      ? new Date(deal.closeDate as unknown as string).toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric' },
                        )
                      : '—';
                    return (
                      <tr
                        key={deal.id}
                        className={cn(
                          'group transition-colors duration-150 cursor-pointer hover:bg-foreground/[0.04]',
                          isSelected && 'bg-foreground/[0.045]',
                        )}
                        onClick={() => setPanelDealId(deal.id)}
                      >
                        <td className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => { e.stopPropagation(); toggleDealSelect(deal.id); }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 rounded border-border cursor-pointer accent-foreground"
                            aria-label={`Select ${deal.title}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
                          {deal.address && (
                            <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                              <MapPin size={10} />
                              {deal.address}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {stage && (
                            <span className="text-xs text-muted-foreground">
                              {stage.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-sm tabular-nums text-foreground text-right">
                          {deal.value != null ? formatCurrency(deal.value) : '—'}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-xs tabular-nums text-muted-foreground">
                          {closeLabel}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-xs tabular-nums text-muted-foreground">
                          {lastActivity}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDuplicateDeal(deal); }}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
                              title="Duplicate"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteDeal(deal.id); }}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                            <ArrowRight
                              size={13}
                              className="ml-1 text-muted-foreground/50"
                              strokeWidth={1.75}
                            />
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

      {ConfirmDialog}

      {/* Bulk move to stage dialog */}
      <Dialog open={bulkStagePicker} onOpenChange={(open) => { if (!open && !bulkPending) setBulkStagePicker(false); }}>
        <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => { if (bulkPending) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (bulkPending) e.preventDefault(); }}>
          <DialogHeader>
            <DialogTitle>Move {selectedDealIds.size} deal{selectedDealIds.size === 1 ? '' : 's'} to stage</DialogTitle>
            <DialogDescription>Select the stage to move the selected deals into.</DialogDescription>
          </DialogHeader>
          <Select value={bulkStageTarget} onValueChange={setBulkStageTarget} disabled={bulkPending}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a stage" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkStagePicker(false)} disabled={bulkPending}>Cancel</Button>
            <Button onClick={bulkMoveToStage} disabled={!bulkStageTarget || bulkPending}>
              {bulkPending ? 'Moving…' : 'Move deals'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Won / Lost reason dialog */}
      {wonLostDialog && (() => {
        const { status } = wonLostDialog;
        const reasons = status === 'won' ? WON_REASONS : LOST_REASONS;
        const title = status === 'won' ? 'Mark as Won' : 'Mark as Lost';
        const confirmLabel = status === 'won' ? 'Mark Won' : 'Mark Lost';
        return (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open && !statusChangePending) setWonLostDialog(null);
            }}
          >
            <DialogContent
              className="sm:max-w-sm"
              onPointerDownOutside={(e) => { if (statusChangePending) e.preventDefault(); }}
              onEscapeKeyDown={(e) => { if (statusChangePending) e.preventDefault(); }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {status === 'won' ? (
                    <Trophy size={16} className="text-emerald-600" />
                  ) : (
                    <XCircle size={16} className="text-destructive" />
                  )}
                  {title}
                </DialogTitle>
                <DialogDescription>
                  {status === 'won'
                    ? 'What was the key reason this deal was won?'
                    : 'What was the primary reason this deal was lost?'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-1">
                <div className="flex flex-wrap gap-2">
                  {reasons.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setSelectedReason(reason)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium border transition-all',
                        selectedReason === reason
                          ? status === 'won'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30'
                            : 'bg-destructive/10 text-destructive border-destructive/30'
                          : 'bg-muted text-muted-foreground border-transparent hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Add a note (optional)…"
                  rows={2}
                  className="resize-none text-sm"
                  disabled={statusChangePending}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setWonLostDialog(null)}
                  disabled={statusChangePending}
                >
                  Cancel
                </Button>
                <Button
                  variant={status === 'won' ? 'default' : 'destructive'}
                  onClick={handleWonLostConfirm}
                  disabled={!selectedReason || statusChangePending}
                  className={status === 'won' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : undefined}
                >
                  {statusChangePending ? 'Saving…' : confirmLabel}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

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

      {/* Slide-over deal panel — opens on card click, no navigation. */}
      <DealQuickPanel
        deal={
          panelDealId
            ? stages.flatMap((s) => s.deals).find((d) => d.id === panelDealId) ?? null
            : null
        }
        slug={slug}
        stages={stages as DealStage[]}
        open={!!panelDealId}
        onOpenChange={(open) => {
          if (!open) setPanelDealId(null);
        }}
        onStatusChange={handleCardStatusChange}
        onStageChange={handlePanelStageChange}
      />
    </div>
  );
}
