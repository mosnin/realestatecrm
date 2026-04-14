'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pencil,
  DollarSign,
  MapPin,
  Calendar,
  Mail,
  Users,
  FileText,
  CheckCircle2,
  Trophy,
  XCircle,
  PauseCircle,
  Activity,
  Clock,
  Send,
  ExternalLink,
  ArrowRight,
  Tag,
  Phone,
  Plus,
  X,
  ListChecks,
} from 'lucide-react';
import Link from 'next/link';
import type { Deal, DealStage, Contact, DealContact, DealActivity, DealMilestone } from '@/lib/types';
import { cn } from '@/lib/utils';
import { timeAgo as relativeTime, formatCurrency } from '@/lib/formatting';

type DealWithRelations = Deal & {
  stage: DealStage;
  dealContacts: (DealContact & { contact: Pick<Contact, 'id' | 'name' | 'type'> })[];
};

interface DealPanelProps {
  deal: DealWithRelations | null;
  open: boolean;
  onClose: () => void;
  onEdit: (deal: DealWithRelations) => void;
  onUpdate: (id: string, updates: Partial<Deal>) => void;
  slug: string;
}

const STATUS_META = {
  active: { label: 'Active', icon: Activity, className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  won: { label: 'Won', icon: Trophy, className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  lost: { label: 'Lost', icon: XCircle, className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  on_hold: { label: 'On Hold', icon: PauseCircle, className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

const ACTIVITY_META = {
  note: { label: 'Note', icon: FileText, color: 'text-slate-500 dark:text-slate-400' },
  call: { label: 'Call', icon: Phone, color: 'text-blue-500 dark:text-blue-400' },
  email: { label: 'Email', icon: Mail, color: 'text-orange-500 dark:text-orange-400' },
  meeting: { label: 'Meeting', icon: Users, color: 'text-teal-500 dark:text-teal-400' },
  follow_up: { label: 'Follow-up', icon: Clock, color: 'text-amber-500 dark:text-amber-400' },
  stage_change: { label: 'Stage change', icon: ArrowRight, color: 'text-muted-foreground' },
  status_change: { label: 'Status change', icon: Tag, color: 'text-muted-foreground' },
};

const WON_REASONS = ['Price', 'Relationship', 'Speed', 'Location', 'Other'] as const;
const LOST_REASONS = ['Price too high', 'Financing fell through', 'Chose another agent', 'Timing', 'Property issue', 'Other'] as const;

const STATUS_CHANGE_META: Record<string, { label: string; className: string }> = {
  active: { label: 'Set to Active', className: 'bg-muted text-muted-foreground' },
  won: { label: 'Marked as Won', className: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15' },
  lost: { label: 'Marked as Lost', className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  on_hold: { label: 'Put On Hold', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

/**
 * Parses stage names out of a stage_change content string like:
 *   Moved from "Old Stage" to "New Stage"
 * Returns { from, to } or null if the pattern doesn't match.
 */
function parseStageChangeContent(content: string | null): { from: string; to: string } | null {
  if (!content) return null;
  const match = content.match(/^Moved from "(.+)" to "(.+)"$/);
  if (!match) return null;
  return { from: match[1], to: match[2] };
}

const DEFAULT_MILESTONES: Omit<DealMilestone, 'id'>[] = [
  { label: 'Inspection period ends', dueDate: null, completed: false, completedAt: null },
  { label: 'Financing contingency deadline', dueDate: null, completed: false, completedAt: null },
  { label: 'Appraisal ordered', dueDate: null, completed: false, completedAt: null },
  { label: 'Title search complete', dueDate: null, completed: false, completedAt: null },
  { label: 'Final walkthrough', dueDate: null, completed: false, completedAt: null },
  { label: 'Closing', dueDate: null, completed: false, completedAt: null },
];

export function DealPanel({ deal, open, onClose, onEdit, onUpdate, slug }: DealPanelProps) {
  const [tab, setTab] = useState<'overview' | 'activity' | 'milestones'>('overview');
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activityType, setActivityType] = useState<string>('note');
  const [activityContent, setActivityContent] = useState('');
  const [postingActivity, setPostingActivity] = useState(false);

  // Milestones state
  const [milestones, setMilestones] = useState<DealMilestone[]>([]);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const saveMilestonesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stores the pre-change baseline for rollback when debouncing rapid saves.
  // Captured on the first call in a debounce sequence; cleared after a successful save.
  const saveMilestonesBaseRef = useRef<DealMilestone[] | null>(null);
  // Tracks whether the current label edit was cancelled via Escape (suppresses onBlur save)
  const labelEditCancelledRef = useRef(false);

  // Won/Lost reason dialog state
  const [wonLostDialog, setWonLostDialog] = useState<{ status: 'won' | 'lost' } | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reasonNote, setReasonNote] = useState('');

  const fetchActivities = useCallback(async () => {
    if (!deal) return;
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/activity`);
      if (res.ok) setActivities(await res.json());
    } finally {
      setActivitiesLoading(false);
    }
  }, [deal?.id]);

  // Sync local milestones from deal prop whenever deal changes or panel opens
  useEffect(() => {
    if (deal) {
      setMilestones(Array.isArray(deal.milestones) ? deal.milestones : []);
    }
  }, [deal?.id, open]);

  const saveMilestones = useCallback(async (updated: DealMilestone[], previous: DealMilestone[]) => {
    if (!deal) return;
    // Debounce rapid saves (e.g. while typing label).
    // On the first call in a sequence, capture the pre-change baseline for rollback.
    // Subsequent calls within the debounce window only update `updated`; the baseline stays fixed
    // so a failed save rolls back to the state before the entire debounced sequence, not just
    // one keystroke back.
    if (!saveMilestonesTimeoutRef.current) {
      saveMilestonesBaseRef.current = previous;
    }
    if (saveMilestonesTimeoutRef.current) clearTimeout(saveMilestonesTimeoutRef.current);
    saveMilestonesTimeoutRef.current = setTimeout(async () => {
      saveMilestonesTimeoutRef.current = null;
      const baseline = saveMilestonesBaseRef.current ?? previous;
      saveMilestonesBaseRef.current = null;
      try {
        const res = await fetch(`/api/deals/${deal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milestones: updated }),
        });
        if (!res.ok) {
          // Roll back optimistic update to the pre-sequence baseline
          setMilestones(baseline);
          toast.error('Failed to save milestones');
        } else {
          // Propagate to parent so the deal object stays in sync
          onUpdate(deal.id, { milestones: updated } as Partial<Deal>);
        }
      } catch {
        // Roll back optimistic update to the pre-sequence baseline
        setMilestones(baseline);
        toast.error('Failed to save milestones');
      }
    }, 400);
  }, [deal?.id, onUpdate]);

  useEffect(() => {
    if (open && deal && tab === 'activity') {
      fetchActivities();
    }
  }, [open, deal, tab, fetchActivities]);

  useEffect(() => {
    if (!open) {
      setTab('overview');
      setActivityContent('');
      setEditingLabelId(null);
    }
  }, [open]);

  // Clear any pending debounced save on unmount to avoid state updates after unmount
  useEffect(() => {
    return () => {
      if (saveMilestonesTimeoutRef.current) {
        clearTimeout(saveMilestonesTimeoutRef.current);
      }
      saveMilestonesBaseRef.current = null;
    };
  }, []);

  async function handlePostActivity() {
    if (!deal || !activityContent.trim()) return;
    setPostingActivity(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activityType, content: activityContent.trim() }),
      });
      if (res.ok) {
        setActivityContent('');
        fetchActivities();
      } else {
        toast.error('Failed to post activity');
      }
    } catch {
      toast.error('Failed to post activity');
    } finally {
      setPostingActivity(false);
    }
  }

  function handleStatusChange(newStatus: string) {
    if (!deal) return;
    if (newStatus === 'won' || newStatus === 'lost') {
      // Reset dialog state and open it
      setSelectedReason(null);
      setReasonNote('');
      setWonLostDialog({ status: newStatus });
      return;
    }
    onUpdate(deal.id, { status: newStatus as Deal['status'] });
  }

  function handleWonLostConfirm() {
    if (!deal || !wonLostDialog || !selectedReason) return;
    onUpdate(deal.id, {
      status: wonLostDialog.status as Deal['status'],
      // @ts-expect-error — extra fields passed through to PATCH body
      wonLostReason: selectedReason,
      wonLostNote: reasonNote.trim() || undefined,
    });
    setWonLostDialog(null);
  }

  function handleWonLostCancel() {
    setWonLostDialog(null);
  }

  async function handleFollowUpChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!deal) return;
    onUpdate(deal.id, { followUpAt: e.target.value ? new Date(e.target.value) : null });
  }

  if (!deal) return null;

  const statusMeta = STATUS_META[deal.status ?? 'active'];
  const followUpRaw = deal.followUpAt ? new Date(deal.followUpAt) : null;
  const followUpDate = followUpRaw && !isNaN(followUpRaw.getTime()) ? followUpRaw : null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const followUpOverdue = Boolean(
    followUpDate &&
      (deal.status ?? 'active') === 'active' &&
      followUpDate.getTime() < startOfToday.getTime(),
  );
  const followUpInputValue = followUpDate
    ? new Date(followUpDate.getTime() - followUpDate.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0]
    : '';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-2">
            <SheetTitle className="text-lg font-bold leading-tight pr-2">{deal.title}</SheetTitle>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Link
                href={`/s/${slug}/deals/${deal.id}`}
                className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Open full page"
              >
                <ExternalLink size={14} />
              </Link>
              <button
                type="button"
                onClick={() => onEdit(deal)}
                className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Pencil size={14} />
              </button>
            </div>
          </div>
          {/* Status badge row */}
          <div className="flex flex-wrap gap-2 mt-1">
            <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md', statusMeta.className)}>
              <statusMeta.icon size={11} />
              {statusMeta.label}
            </span>
            {deal.value != null && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-2 py-0.5">
                <DollarSign size={10} />
                {deal.value.toLocaleString()}
              </span>
            )}
            {followUpDate && (
              <span className={cn(
                'inline-flex items-center gap-1 text-xs font-semibold rounded-md px-2 py-0.5',
                followUpOverdue
                  ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
              )}>
                <Calendar size={10} />
                {followUpOverdue ? 'Overdue: ' : ''}
                {followUpDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {(['overview', 'activity', 'milestones'] as const).map((t) => {
            const completedCount = milestones.filter((m) => m.completed).length;
            const totalCount = milestones.length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); if (t === 'activity') fetchActivities(); }}
                className={cn(
                  'py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
                  tab === t
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {t === 'milestones' ? 'Milestones' : t.charAt(0).toUpperCase() + t.slice(1)}
                {t === 'milestones' && totalCount > 0 && (
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none',
                    completedCount === totalCount
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {completedCount}/{totalCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* Status selector */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Status</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(STATUS_META) as [string, typeof STATUS_META['active']][]).map(([key, meta]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleStatusChange(key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border-2 transition-all',
                        (deal.status ?? 'active') === key
                          ? `${meta.className} border-current`
                          : 'border-transparent bg-muted text-muted-foreground hover:bg-accent'
                      )}
                    >
                      <meta.icon size={11} />
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Follow-up date */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Next follow-up
                </label>
                <input
                  type="date"
                  value={followUpInputValue}
                  onChange={handleFollowUpChange}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Deal details */}
              <div className="space-y-2 text-sm">
                {deal.address && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin size={14} className="flex-shrink-0" />
                    <span>{deal.address}</span>
                  </div>
                )}
                {deal.stage && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: deal.stage.color }}
                    />
                    <span>{deal.stage.name}</span>
                  </div>
                )}
                {deal.closeDate && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar size={14} className="flex-shrink-0" />
                    <span>Close: {new Date(deal.closeDate).toLocaleDateString()}</span>
                  </div>
                )}
                {deal.commissionRate != null && deal.value != null ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign size={14} className="flex-shrink-0" />
                    <span>
                      Commission: {deal.commissionRate}% = {formatCurrency(deal.value * deal.commissionRate / 100)}
                    </span>
                  </div>
                ) : deal.commissionRate != null ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <DollarSign size={14} className="flex-shrink-0" />
                    <span>Commission rate: {deal.commissionRate}%</span>
                  </div>
                ) : null}
                {deal.probability != null && (
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold',
                        deal.probability >= 70
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : deal.probability >= 40
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                          : 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400',
                      )}
                    >
                      {deal.probability}% likely to close
                    </span>
                    {deal.value != null && (
                      <span className="text-xs text-muted-foreground">
                        Weighted: {formatCurrency(Math.round(deal.value * deal.probability / 100))}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              {deal.description && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Notes</label>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.description}</p>
                </div>
              )}

              {/* Linked contacts */}
              {deal.dealContacts.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">Contacts</label>
                  <div className="space-y-1.5">
                    {deal.dealContacts.map(({ contact }) => (
                      <div key={contact.id} className="flex items-center gap-2 text-sm">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{contact.name}</span>
                        {contact.type && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-normal ml-auto">
                            {contact.type}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'milestones' && (
            <div className="space-y-3">
              {/* Progress header */}
              {milestones.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Transaction Checklist
                  </span>
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    milestones.filter((m) => m.completed).length === milestones.length
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                      : 'bg-muted text-muted-foreground'
                  )}>
                    {milestones.filter((m) => m.completed).length} / {milestones.length} complete
                  </span>
                </div>
              )}

              {/* Empty state — Use Template */}
              {milestones.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <ListChecks size={32} className="text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">No milestones yet.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const previous = milestones;
                      const seeded: DealMilestone[] = DEFAULT_MILESTONES.map((m) => ({
                        ...m,
                        id: crypto.randomUUID(),
                      }));
                      setMilestones(seeded);
                      saveMilestones(seeded, previous);
                    }}
                  >
                    Use template
                  </Button>
                </div>
              )}

              {/* Checklist rows */}
              {milestones.length > 0 && (
                <div className="space-y-1">
                  {milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      className={cn(
                        'group flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/50',
                        milestone.completed && 'opacity-60'
                      )}
                    >
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={milestone.completed}
                        onChange={(e) => {
                          const previous = milestones;
                          const updated = milestones.map((m) =>
                            m.id === milestone.id
                              ? {
                                  ...m,
                                  completed: e.target.checked,
                                  completedAt: e.target.checked ? new Date().toISOString() : null,
                                }
                              : m
                          );
                          setMilestones(updated);
                          saveMilestones(updated, previous);
                        }}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-input accent-primary"
                      />

                      {/* Label + date */}
                      <div className="flex-1 min-w-0 space-y-1">
                        {editingLabelId === milestone.id ? (
                          <input
                            autoFocus
                            type="text"
                            maxLength={120}
                            defaultValue={milestone.label}
                            className="w-full rounded border border-input bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            onBlur={(e) => {
                              if (labelEditCancelledRef.current) {
                                labelEditCancelledRef.current = false;
                                setEditingLabelId(null);
                                return;
                              }
                              const previous = milestones;
                              const newLabel = e.target.value.trim() || milestone.label;
                              const updated = milestones.map((m) =>
                                m.id === milestone.id ? { ...m, label: newLabel } : m
                              );
                              setMilestones(updated);
                              setEditingLabelId(null);
                              saveMilestones(updated, previous);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                              if (e.key === 'Escape') {
                                labelEditCancelledRef.current = true;
                                e.currentTarget.blur();
                              }
                            }}
                          />
                        ) : (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => setEditingLabelId(milestone.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setEditingLabelId(milestone.id); }}
                            className={cn(
                              'block text-sm cursor-text leading-snug',
                              milestone.completed && 'line-through text-muted-foreground'
                            )}
                          >
                            {milestone.label}
                          </span>
                        )}

                        {/* Due date input */}
                        <input
                          type="date"
                          value={milestone.dueDate ?? ''}
                          onChange={(e) => {
                            const previous = milestones;
                            const updated = milestones.map((m) =>
                              m.id === milestone.id
                                ? { ...m, dueDate: e.target.value || null }
                                : m
                            );
                            setMilestones(updated);
                            saveMilestones(updated, previous);
                          }}
                          className="text-xs text-muted-foreground border-0 bg-transparent p-0 focus:outline-none focus:ring-0 cursor-pointer [color-scheme:light] dark:[color-scheme:dark]"
                          placeholder="No date"
                          title="Due date (optional)"
                        />
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => {
                          const previous = milestones;
                          const updated = milestones.filter((m) => m.id !== milestone.id);
                          setMilestones(updated);
                          if (editingLabelId === milestone.id) setEditingLabelId(null);
                          saveMilestones(updated, previous);
                        }}
                        className="flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted transition-all"
                        title="Remove milestone"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add milestone button */}
              {milestones.length > 0 && milestones.length < 20 && (
                <button
                  type="button"
                  onClick={() => {
                    const newMilestone: DealMilestone = {
                      id: crypto.randomUUID(),
                      label: 'New milestone',
                      dueDate: null,
                      completed: false,
                      completedAt: null,
                    };
                    const previous = milestones;
                    const updated = [...milestones, newMilestone];
                    setMilestones(updated);
                    setEditingLabelId(newMilestone.id);
                    saveMilestones(updated, previous);
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted w-full"
                >
                  <Plus size={14} />
                  Add milestone
                </button>
              )}
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-4">
              {/* Add activity */}
              <div className="rounded-lg border border-border p-3 space-y-2.5">
                <div className="flex gap-2">
                  <Select value={activityType} onValueChange={setActivityType}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="note">Note</SelectItem>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                  placeholder="Add a note, log a call…"
                  rows={2}
                  className="resize-none text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handlePostActivity}
                    disabled={!activityContent.trim() || postingActivity}
                  >
                    <Send size={12} className="mr-1.5" />
                    Post
                  </Button>
                </div>
              </div>

              {/* Activity timeline */}
              {activitiesLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading…</div>
              ) : activities.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <Activity size={28} className="mx-auto mb-2 opacity-30" />
                  No activity yet. Log a call or add a note.
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => {
                    const meta = ACTIVITY_META[activity.type] ?? ACTIVITY_META.note;
                    const Icon = meta.icon;

                    // --- stage_change: parse from/to names out of content ---
                    const stageNames =
                      activity.type === 'stage_change'
                        ? parseStageChangeContent(activity.content)
                        : null;

                    // --- status_change: read toStatus from metadata ---
                    const toStatus =
                      activity.type === 'status_change' && activity.metadata
                        ? (activity.metadata.toStatus as string | undefined)
                        : undefined;
                    const statusChangeMeta =
                      toStatus ? STATUS_CHANGE_META[toStatus] ?? null : null;

                    return (
                      <div key={activity.id} className="flex gap-3">
                        <div className={cn('flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5', meta.color)}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* stage_change with parseable names */}
                          {activity.type === 'stage_change' && stageNames ? (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground">{stageNames.from}</span>
                                <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
                                <span className="rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground">{stageNames.to}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                {relativeTime(new Date(activity.createdAt))}
                              </span>
                            </>
                          ) : activity.type === 'status_change' && statusChangeMeta ? (
                            /* status_change with known toStatus */
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusChangeMeta.className)}>
                                  {statusChangeMeta.label}
                                </span>
                                {activity.metadata?.reason && (
                                  <span className="text-xs text-muted-foreground">
                                    · Reason: {activity.metadata.reason as string}
                                  </span>
                                )}
                              </div>
                              {activity.metadata?.note && (
                                <p className="text-xs text-muted-foreground mt-0.5 italic">
                                  &ldquo;{activity.metadata.note as string}&rdquo;
                                </p>
                              )}
                              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                {relativeTime(new Date(activity.createdAt))}
                              </span>
                            </>
                          ) : (
                            /* default rendering for note / call / email / meeting / follow_up,
                               and fallback for stage_change / status_change with missing metadata */
                            <>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {relativeTime(new Date(activity.createdAt))}
                                </span>
                              </div>
                              {activity.content && (
                                <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{activity.content}</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>

      {/* Won/Lost reason dialog */}
      <Dialog open={!!wonLostDialog} onOpenChange={(o) => { if (!o) handleWonLostCancel(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {wonLostDialog?.status === 'won' ? 'Why was this deal won?' : 'Why was this deal lost?'}
            </DialogTitle>
          </DialogHeader>

          {/* Reason chips */}
          <div className="flex flex-wrap gap-2 py-1">
            {(wonLostDialog?.status === 'won' ? WON_REASONS : LOST_REASONS).map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedReason(reason)}
                className={cn(
                  'text-xs font-medium px-3 py-1.5 rounded-full border transition-all',
                  selectedReason === reason
                    ? wonLostDialog?.status === 'won'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-red-600 text-white border-red-600'
                    : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {reason}
              </button>
            ))}
          </div>

          {/* Optional note */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Note <span className="normal-case font-normal">(optional)</span>
            </label>
            <input
              type="text"
              maxLength={120}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Add a note…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleWonLostCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedReason}
              onClick={handleWonLostConfirm}
              className={wonLostDialog?.status === 'lost' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
