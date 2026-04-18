'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Search, UserPlus, UserMinus, Check, PhoneIncoming, Users, CalendarClock, Handshake, ArrowRight, Clock, MessageSquare, ChevronDown, ChevronUp, Loader2, Home, Key, ArrowUpDown, Trash2, LayoutGrid, List, Mail, Phone as PhoneIcon, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { formatCompact } from '@/lib/formatting';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  budget: number | null;
  scoreLabel: string | null;
  leadScore: number | null;
  leadType: 'rental' | 'buyer' | null;
  moveTiming: string | null;
  createdAt: string;
  assignedTo: string | null;
  assignedAt: string | null;
}

export interface AssignedLeadProgress {
  realtorName: string;
  assignedAt: string;
  assignedContactId: string;
  assignedSpaceId: string;
  currentStage: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
  currentScore: number | null;
  currentScoreLabel: string | null;
  lastActivityAt: string | null;
  hasFollowUp: boolean;
  followUpAt: string | null;
  hasDeal: boolean;
}

export interface RealtorOption {
  userId: string;
  name: string | null;
  email: string;
  spaceId: string | null;
  leadCount: number;
}

interface Props {
  unassignedLeads: LeadRow[];
  assignedLeads: LeadRow[];
  realtors: RealtorOption[];
  assignedLeadProgress?: Record<string, AssignedLeadProgress>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreBadge(label: string | null) {
  if (!label) return null;
  const l = label.toLowerCase();
  let className = 'bg-muted text-muted-foreground';
  if (l === 'hot') className = 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
  if (l === 'warm') className = 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
  if (l === 'cold') className = 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
  return (
    <Badge variant="secondary" className={className}>
      {label}
    </Badge>
  );
}

function leadTypeBadge(leadType: 'rental' | 'buyer' | null) {
  if (leadType === 'buyer') {
    return (
      <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">
        <Key size={10} className="mr-1" />
        Buyer
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400">
      <Home size={10} className="mr-1" />
      Rental
    </Badge>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initials(name: string | null, email: string | null) {
  const str = name || email || '?';
  return str
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Realtor picker popover ────────────────────────────────────────────────────

function RealtorPicker({
  realtors,
  onSelect,
  disabled,
}: {
  realtors: RealtorOption[];
  onSelect: (r: RealtorOption) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return realtors;
    const q = search.toLowerCase();
    return realtors.filter(
      (r) =>
        (r.name ?? '').toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
    );
  }, [realtors, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <UserPlus size={13} />
          Assign
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-2 border-b border-border">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
            <Search size={13} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search team members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground text-center">No team members found</p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.userId}
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                  setSearch('');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-[10px] font-semibold flex-shrink-0">
                  {initials(r.name, r.email)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name ?? r.email}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  {r.leadCount} leads
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Lead notes component ─────────────────────────────────────────────────────

function LeadNotes({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadNotes = useCallback(async () => {
    if (loaded) return;
    try {
      const res = await fetch(`/api/broker/lead-note?contactId=${contactId}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes ?? '');
      }
    } catch {
      // Silently fail
    } finally {
      setLoaded(true);
    }
  }, [contactId, loaded]);

  // Load notes on mount
  useState(() => { loadNotes(); });

  async function handleAddNote(noteText: string) {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/broker/lead-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, note: noteText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save note');
      }
      const data = await res.json();
      setNotes(data.updatedNotes);
      if (textareaRef.current) textareaRef.current.value = '';
      toast.success('Note saved');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  // Parse notes into individual entries
  const noteEntries = notes
    .split(/\n\n/)
    .filter((n) => n.trim())
    .slice(0, 10);

  return (
    <div className="space-y-2">
      {/* Note input */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          placeholder="Add a note..."
          rows={2}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs resize-none placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleAddNote(e.currentTarget.value);
            }
          }}
        />
        <button
          disabled={saving}
          onClick={() => {
            if (textareaRef.current) handleAddNote(textareaRef.current.value);
          }}
          className="self-end px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">Press Cmd+Enter to save</p>

      {/* Existing notes */}
      {noteEntries.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {noteEntries.map((entry, i) => (
            <div key={i} className="text-xs text-muted-foreground bg-muted/40 rounded px-2.5 py-1.5 whitespace-pre-wrap">
              {entry}
            </div>
          ))}
        </div>
      )}
      {loaded && noteEntries.length === 0 && (
        <p className="text-[11px] text-muted-foreground/60 italic">No notes yet</p>
      )}
    </div>
  );
}

// ── Lead row component ────────────────────────────────────────────────────────

function LeadItem({
  lead,
  realtors,
  onAssigned,
  onDeleted,
}: {
  lead: LeadRow;
  realtors: RealtorOption[];
  onAssigned: (leadId: string, realtor: RealtorOption) => void;
  onDeleted: (leadId: string) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Lead deleted');
      onDeleted(lead.id);
    } catch {
      toast.error('Failed to delete lead');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleAssign(realtor: RealtorOption) {
    setAssigning(true);
    try {
      const res = await fetch('/api/broker/assign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id, realtorUserId: realtor.userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to assign lead');
      }
      toast.success(`Lead assigned to ${realtor.name ?? realtor.email}`);
      onAssigned(lead.id, realtor);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign lead');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
          {initials(lead.name, lead.email)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{lead.name || 'Unnamed'}</p>
            {leadTypeBadge(lead.leadType)}
            {scoreBadge(lead.scoreLabel)}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {lead.email && <span>{lead.email}</span>}
            {lead.phone && <span>{lead.phone}</span>}
            {lead.budget != null && <span>Budget: {formatCompact(lead.budget)}</span>}
            {lead.moveTiming && <span>Move: {lead.moveTiming}</span>}
          </div>
        </div>

        {/* Notes toggle */}
        <button
          onClick={() => setShowNotes(!showNotes)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
          title="Notes"
        >
          <MessageSquare size={13} />
          {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {/* Date */}
        <p className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0 hidden sm:block">
          {formatDate(lead.createdAt)}
        </p>

        {/* Assign */}
        <RealtorPicker realtors={realtors} onSelect={(r) => handleAssign(r)} disabled={assigning} />

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={handleDelete} disabled={deleting} className="px-2 py-1 text-[10px] font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
              {deleting ? 'Deleting...' : 'Confirm'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-[10px] font-medium rounded border border-border hover:bg-muted">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            title="Delete lead"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Notes panel */}
      {showNotes && (
        <div className="px-4 pb-3 pl-[calc(36px+1rem)]">
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <LeadNotes contactId={lead.id} />
          </div>
        </div>
      )}
    </div>
  );
}

function stageBadge(stage: AssignedLeadProgress['currentStage']) {
  const styles: Record<string, string> = {
    QUALIFICATION: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    TOUR: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
    APPLICATION: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  };
  const labels: Record<string, string> = {
    QUALIFICATION: 'Qualification',
    TOUR: 'Tour',
    APPLICATION: 'Application',
  };
  return (
    <Badge variant="secondary" className={styles[stage] ?? 'bg-muted text-muted-foreground'}>
      {labels[stage] ?? stage}
    </Badge>
  );
}

function stageProgress(stage: AssignedLeadProgress['currentStage']) {
  const stages = ['QUALIFICATION', 'TOUR', 'APPLICATION'] as const;
  const idx = stages.indexOf(stage);
  return (
    <div className="flex items-center gap-1">
      {stages.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div
            className={`w-2 h-2 rounded-full ${
              i <= idx
                ? 'bg-primary'
                : 'bg-muted-foreground/20'
            }`}
          />
          {i < stages.length - 1 && (
            <div className={`w-3 h-px ${i < idx ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function relativeTime(iso: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function AssignedLeadItem({
  lead,
  progress,
  onUnassigned,
}: {
  lead: LeadRow;
  progress?: AssignedLeadProgress;
  onUnassigned?: (leadId: string, realtorName: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const realtorName = progress?.realtorName ?? lead.assignedTo ?? 'this realtor';

  async function handleUnassign() {
    setUnassigning(true);
    try {
      const res = await fetch('/api/broker/unassign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to unassign lead');
      }
      toast.success(`Lead unassigned from ${realtorName}`);
      setConfirmOpen(false);
      onUnassigned?.(lead.id, realtorName);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unassign lead');
    } finally {
      setUnassigning(false);
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => progress && setExpanded(!expanded)}
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
          {initials(lead.name, lead.email)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{lead.name || 'Unnamed'}</p>
            {leadTypeBadge(lead.leadType)}
            {progress ? stageBadge(progress.currentStage) : scoreBadge(lead.scoreLabel)}
            {progress?.hasDeal && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                <Handshake size={10} className="mr-1" />
                Deal
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {(progress?.realtorName ?? lead.assignedTo) && (
              <span className="inline-flex items-center gap-1">
                <Check size={10} className="text-green-600" />
                {progress?.realtorName ?? lead.assignedTo}
              </span>
            )}
            {progress && stageProgress(progress.currentStage)}
            {progress?.lastActivityAt && (
              <span className="inline-flex items-center gap-1">
                <Clock size={10} />
                {relativeTime(progress.lastActivityAt)}
              </span>
            )}
            {progress?.hasFollowUp && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <CalendarClock size={10} />
                Follow-up set
              </span>
            )}
            {!progress && lead.assignedAt && <span>Assigned {formatDate(lead.assignedAt)}</span>}
          </div>
        </div>

        {/* Notes toggle (when no progress expand) */}
        {!progress && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowNotes(!showNotes);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
            title="Notes"
          >
            <MessageSquare size={13} />
            {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}

        {/* Score + Unassign */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(progress?.currentScore ?? lead.leadScore) != null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Score: {progress?.currentScore ?? lead.leadScore}
            </span>
          )}

          {/* Unassign button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
            disabled={unassigning}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 hover:border-red-300 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title="Unassign lead"
          >
            <UserMinus size={12} />
            <span className="hidden sm:inline">Unassign</span>
          </button>

          {progress && (
            <ArrowRight
              size={14}
              className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          )}
        </div>
      </div>

      {/* Unassign confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign Lead</DialogTitle>
            <DialogDescription>
              Unassign <span className="font-medium text-foreground">{lead.name || 'this lead'}</span> from{' '}
              <span className="font-medium text-foreground">{realtorName}</span>?
              This will remove the lead from their CRM.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={unassigning}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUnassign}
              disabled={unassigning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {unassigning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <UserMinus size={14} />
              )}
              Unassign
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expanded detail panel */}
      {expanded && progress && (
        <div className="px-4 pb-3 pl-[calc(36px+1rem)]">
          <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Realtor</p>
                <p className="font-medium">{progress.realtorName}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Stage</p>
                <p className="font-medium">{progress.currentStage.charAt(0) + progress.currentStage.slice(1).toLowerCase()}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Score</p>
                <p className="font-medium">
                  {progress.currentScore != null ? progress.currentScore : '--'}
                  {progress.currentScoreLabel && (
                    <span className="ml-1 text-muted-foreground">({progress.currentScoreLabel})</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Assigned</p>
                <p className="font-medium">{formatDate(progress.assignedAt)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Last Activity</p>
                <p className="font-medium">{progress.lastActivityAt ? relativeTime(progress.lastActivityAt) : 'No activity yet'}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Follow-up</p>
                <p className="font-medium">
                  {progress.followUpAt ? formatDate(progress.followUpAt) : 'None scheduled'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground font-medium mb-0.5">Deal Created</p>
                <p className="font-medium">{progress.hasDeal ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {/* Notes section */}
            <div className="border-t border-border pt-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNotes(!showNotes);
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <MessageSquare size={12} />
                Notes
                {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
              {showNotes && <LeadNotes contactId={lead.id} />}
            </div>
          </div>
        </div>
      )}

      {/* Notes panel for non-progress leads */}
      {showNotes && !progress && (
        <div className="px-4 pb-3 pl-[calc(36px+1rem)]">
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <LeadNotes contactId={lead.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Currency formatter ──────────────────────────────────────────────────────

function formatCurrency(amount: number | null) {
  if (amount == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

// ── Unassigned Lead Card (card view) ────────────────────────────────────────

function LeadCard({
  lead,
  realtors,
  onAssigned,
  onDeleted,
}: {
  lead: LeadRow;
  realtors: RealtorOption[];
  onAssigned: (leadId: string, realtor: RealtorOption) => void;
  onDeleted: (leadId: string) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Lead deleted');
      onDeleted(lead.id);
    } catch {
      toast.error('Failed to delete lead');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleAssign(realtor: RealtorOption) {
    setAssigning(true);
    try {
      const res = await fetch('/api/broker/assign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id, realtorUserId: realtor.userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to assign lead');
      }
      toast.success(`Lead assigned to ${realtor.name ?? realtor.email}`);
      onAssigned(lead.id, realtor);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign lead');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Header: name + badges */}
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold truncate">{lead.name || 'Unnamed'}</h3>
            {/* Delete button */}
            {confirmDelete ? (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={handleDelete} disabled={deleting} className="px-2 py-0.5 text-[10px] font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                  {deleting ? '...' : 'Yes'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-2 py-0.5 text-[10px] font-medium rounded border border-border hover:bg-muted">
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors flex-shrink-0"
                title="Delete lead"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {leadTypeBadge(lead.leadType)}
            {scoreBadge(lead.scoreLabel)}
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-1 text-xs text-muted-foreground">
          {lead.email && (
            <div className="flex items-center gap-1.5 truncate">
              <Mail size={11} className="flex-shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <PhoneIcon size={11} className="flex-shrink-0" />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>

        {/* Budget + date */}
        <div className="flex items-center justify-between text-xs">
          {lead.budget != null ? (
            <span className="font-medium text-foreground">{formatCurrency(lead.budget)}</span>
          ) : (
            <span className="text-muted-foreground">No budget</span>
          )}
          <span className="text-muted-foreground">{relativeTime(lead.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <div className="flex-1">
            <RealtorPicker realtors={realtors} onSelect={(r) => handleAssign(r)} disabled={assigning} />
          </div>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
            title="Notes"
          >
            <MessageSquare size={12} />
            {showNotes ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>

        {/* Notes panel */}
        {showNotes && (
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <LeadNotes contactId={lead.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Unassigned Table View ───────────────────────────────────────────────────

function UnassignedTableView({
  leads,
  realtors,
  onAssigned,
  onDeleted,
}: {
  leads: LeadRow[];
  realtors: RealtorOption[];
  onAssigned: (leadId: string, realtor: RealtorOption) => void;
  onDeleted: (leadId: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Score</th>
                <th className="text-left px-3 py-2.5 hidden md:table-cell">Email</th>
                <th className="text-left px-3 py-2.5 hidden lg:table-cell">Phone</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Budget</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Date</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <UnassignedTableRow key={lead.id} lead={lead} realtors={realtors} onAssigned={onAssigned} onDeleted={onDeleted} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function UnassignedTableRow({
  lead,
  realtors,
  onAssigned,
  onDeleted,
}: {
  lead: LeadRow;
  realtors: RealtorOption[];
  onAssigned: (leadId: string, realtor: RealtorOption) => void;
  onDeleted: (leadId: string) => void;
}) {
  const [assigning, setAssigning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/contacts/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Lead deleted');
      onDeleted(lead.id);
    } catch {
      toast.error('Failed to delete lead');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleAssign(realtor: RealtorOption) {
    setAssigning(true);
    try {
      const res = await fetch('/api/broker/assign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id, realtorUserId: realtor.userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to assign lead');
      }
      toast.success(`Lead assigned to ${realtor.name ?? realtor.email}`);
      onAssigned(lead.id, realtor);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign lead');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 font-medium truncate max-w-[180px]">{lead.name || 'Unnamed'}</td>
      <td className="px-3 py-2.5">{leadTypeBadge(lead.leadType)}</td>
      <td className="px-3 py-2.5">{scoreBadge(lead.scoreLabel)}</td>
      <td className="px-3 py-2.5 text-muted-foreground text-xs truncate max-w-[200px] hidden md:table-cell">{lead.email ?? '--'}</td>
      <td className="px-3 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">{lead.phone ?? '--'}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums hidden sm:table-cell">{lead.budget != null ? formatCurrency(lead.budget) : '--'}</td>
      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums hidden sm:table-cell">{relativeTime(lead.createdAt)}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          <RealtorPicker realtors={realtors} onSelect={(r) => handleAssign(r)} disabled={assigning} />
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={handleDelete} disabled={deleting} className="px-2 py-1 text-[10px] font-medium rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">
                {deleting ? '...' : 'Yes'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 text-[10px] font-medium rounded border border-border hover:bg-muted">
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Delete lead"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Assigned Lead Card (card view) ──────────────────────────────────────────

function AssignedLeadCard({
  lead,
  progress,
  onUnassigned,
}: {
  lead: LeadRow;
  progress?: AssignedLeadProgress;
  onUnassigned?: (leadId: string, realtorName: string) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const realtorName = progress?.realtorName ?? lead.assignedTo ?? 'this realtor';

  async function handleUnassign() {
    setUnassigning(true);
    try {
      const res = await fetch('/api/broker/unassign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to unassign lead');
      }
      toast.success(`Lead unassigned from ${realtorName}`);
      setConfirmOpen(false);
      onUnassigned?.(lead.id, realtorName);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unassign lead');
    } finally {
      setUnassigning(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        {/* Header: name + badges */}
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold truncate">{lead.name || 'Unnamed'}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {leadTypeBadge(lead.leadType)}
            {progress ? stageBadge(progress.currentStage) : scoreBadge(lead.scoreLabel)}
            {progress?.hasDeal && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                <Handshake size={10} className="mr-1" />
                Deal
              </Badge>
            )}
          </div>
        </div>

        {/* Contact info */}
        <div className="space-y-1 text-xs text-muted-foreground">
          {lead.email && (
            <div className="flex items-center gap-1.5 truncate">
              <Mail size={11} className="flex-shrink-0" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5">
              <PhoneIcon size={11} className="flex-shrink-0" />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>

        {/* Assignment info */}
        <div className="space-y-1 text-xs">
          {(progress?.realtorName ?? lead.assignedTo) && (
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Check size={11} />
              <span className="font-medium">{progress?.realtorName ?? lead.assignedTo}</span>
            </div>
          )}
          {progress && (
            <div className="flex items-center gap-2">
              {stageProgress(progress.currentStage)}
              {progress.lastActivityAt && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Clock size={10} />
                  {relativeTime(progress.lastActivityAt)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Budget + date */}
        <div className="flex items-center justify-between text-xs">
          {lead.budget != null ? (
            <span className="font-medium text-foreground">{formatCurrency(lead.budget)}</span>
          ) : (
            <span className="text-muted-foreground">No budget</span>
          )}
          <span className="text-muted-foreground">{relativeTime(lead.createdAt)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={unassigning}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 hover:border-red-300 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title="Unassign lead"
          >
            <UserMinus size={12} />
            Unassign
          </button>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors ml-auto"
            title="Notes"
          >
            <MessageSquare size={12} />
            {showNotes ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>

        {/* Notes panel */}
        {showNotes && (
          <div className="rounded-lg bg-muted/40 border border-border p-3">
            <LeadNotes contactId={lead.id} />
          </div>
        )}
      </CardContent>

      {/* Unassign confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign Lead</DialogTitle>
            <DialogDescription>
              Unassign <span className="font-medium text-foreground">{lead.name || 'this lead'}</span> from{' '}
              <span className="font-medium text-foreground">{realtorName}</span>?
              This will remove the lead from their CRM.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={unassigning}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUnassign}
              disabled={unassigning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {unassigning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <UserMinus size={14} />
              )}
              Unassign
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Assigned Table View ─────────────────────────────────────────────────────

function AssignedTableView({
  leads,
  assignedLeadProgress,
  onUnassigned,
}: {
  leads: LeadRow[];
  assignedLeadProgress: Record<string, AssignedLeadProgress>;
  onUnassigned: (leadId: string, realtorName: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Name</th>
                <th className="text-left px-3 py-2.5">Type</th>
                <th className="text-left px-3 py-2.5">Score</th>
                <th className="text-left px-3 py-2.5 hidden md:table-cell">Assigned To</th>
                <th className="text-left px-3 py-2.5 hidden lg:table-cell">Stage</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Budget</th>
                <th className="text-right px-3 py-2.5 hidden sm:table-cell">Date</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <AssignedTableRow
                  key={lead.id}
                  lead={lead}
                  progress={assignedLeadProgress[lead.id]}
                  onUnassigned={onUnassigned}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AssignedTableRow({
  lead,
  progress,
  onUnassigned,
}: {
  lead: LeadRow;
  progress?: AssignedLeadProgress;
  onUnassigned?: (leadId: string, realtorName: string) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const realtorName = progress?.realtorName ?? lead.assignedTo ?? 'this realtor';

  async function handleUnassign() {
    setUnassigning(true);
    try {
      const res = await fetch('/api/broker/unassign-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to unassign lead');
      }
      toast.success(`Lead unassigned from ${realtorName}`);
      setConfirmOpen(false);
      onUnassigned?.(lead.id, realtorName);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unassign lead');
    } finally {
      setUnassigning(false);
    }
  }

  return (
    <>
      <tr className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
        <td className="px-4 py-2.5 font-medium truncate max-w-[180px]">{lead.name || 'Unnamed'}</td>
        <td className="px-3 py-2.5">{leadTypeBadge(lead.leadType)}</td>
        <td className="px-3 py-2.5">{progress ? stageBadge(progress.currentStage) : scoreBadge(lead.scoreLabel)}</td>
        <td className="px-3 py-2.5 text-xs hidden md:table-cell">
          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
            <Check size={10} />
            {progress?.realtorName ?? lead.assignedTo ?? '--'}
          </span>
        </td>
        <td className="px-3 py-2.5 text-xs hidden lg:table-cell">
          {progress ? (
            <div className="flex items-center gap-2">
              {stageProgress(progress.currentStage)}
            </div>
          ) : '--'}
        </td>
        <td className="px-3 py-2.5 text-right text-xs tabular-nums hidden sm:table-cell">{lead.budget != null ? formatCurrency(lead.budget) : '--'}</td>
        <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums hidden sm:table-cell">{relativeTime(lead.createdAt)}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={unassigning}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 hover:border-red-300 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              title="Unassign lead"
            >
              <UserMinus size={12} />
              <span className="hidden sm:inline">Unassign</span>
            </button>
          </div>
        </td>
      </tr>

      {/* Unassign confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unassign Lead</DialogTitle>
            <DialogDescription>
              Unassign <span className="font-medium text-foreground">{lead.name || 'this lead'}</span> from{' '}
              <span className="font-medium text-foreground">{realtorName}</span>?
              This will remove the lead from their CRM.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setConfirmOpen(false)}
              disabled={unassigning}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUnassign}
              disabled={unassigning}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {unassigning ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <UserMinus size={14} />
              )}
              Unassign
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Add Lead Dialog ───────────────────────────────────────────────────────────

function AddLeadDialog({
  open,
  onOpenChange,
  onLeadAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadAdded: (lead: LeadRow) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [leadType, setLeadType] = useState<'rental' | 'buyer'>('rental');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setLeadType('rental');
    setBudget('');
    setNotes('');
    setErrors({});
  }

  function handleOpenChange(val: boolean) {
    if (!val) resetForm();
    onOpenChange(val);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'First name is required';
    if (!lastName.trim()) next.lastName = 'Last name is required';
    if (!email.trim()) {
      next.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Invalid email address';
    }
    if (budget !== '' && (isNaN(Number(budget)) || Number(budget) <= 0)) {
      next.budget = 'Budget must be a positive number';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/brokerages/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          leadType,
          budget: budget !== '' ? Number(budget) : null,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add lead');
      }

      const data = await res.json();
      const newLead: LeadRow = {
        id: data.contact.id,
        name: data.contact.name,
        email: data.contact.email,
        phone: data.contact.phone,
        budget: data.contact.budget,
        scoreLabel: data.contact.scoreLabel,
        leadScore: data.contact.leadScore,
        leadType: data.contact.leadType,
        moveTiming: null,
        createdAt: data.contact.createdAt,
        assignedTo: null,
        assignedAt: null,
      };

      toast.success(`Lead added: ${data.contact.name}`);
      onLeadAdded(newLead);
      handleOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add lead');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';
  const labelClass = 'block text-xs font-medium text-foreground mb-1';
  const errorClass = 'mt-1 text-[11px] text-destructive';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Lead</DialogTitle>
          <DialogDescription>
            Manually add a new lead to the brokerage pipeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>
                First name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
                disabled={submitting}
                autoComplete="given-name"
              />
              {errors.firstName && <p className={errorClass}>{errors.firstName}</p>}
            </div>
            <div>
              <label className={labelClass}>
                Last name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="Smith"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClass}
                disabled={submitting}
                autoComplete="family-name"
              />
              {errors.lastName && <p className={errorClass}>{errors.lastName}</p>}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className={labelClass}>
              Email <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              disabled={submitting}
              autoComplete="email"
            />
            {errors.email && <p className={errorClass}>{errors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              disabled={submitting}
              autoComplete="tel"
            />
          </div>

          {/* Lead type toggle */}
          <div>
            <label className={labelClass}>
              Lead type <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 w-fit">
              {(['rental', 'buyer'] as const).map((lt) => (
                <button
                  key={lt}
                  type="button"
                  onClick={() => setLeadType(lt)}
                  disabled={submitting}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
                    leadType === lt
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {lt === 'rental' ? (
                    <><Home size={13} /> Renter</>
                  ) : (
                    <><Key size={13} /> Buyer</>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div>
            <label className={labelClass}>Budget</label>
            <input
              type="number"
              placeholder="e.g. 2500"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className={inputClass}
              disabled={submitting}
              min="0"
              step="any"
            />
            {errors.budget && <p className={errorClass}>{errors.budget}</p>}
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              placeholder="Any relevant details about this lead..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              disabled={submitting}
            />
          </div>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              {submitting ? 'Adding...' : 'Add Lead'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ViewMode = 'card' | 'table';
type BrokerSortKey = 'newest' | 'oldest' | 'score' | 'score-low' | 'name-az' | 'name-za';
type ScoreFilter = 'all' | 'hot' | 'warm' | 'cold';

const BROKER_SORT_OPTIONS: { value: BrokerSortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'score', label: 'Highest score' },
  { value: 'score-low', label: 'Lowest score' },
  { value: 'name-az', label: 'Name A-Z' },
  { value: 'name-za', label: 'Name Z-A' },
];

export function BrokerLeadsClient({ unassignedLeads, assignedLeads, realtors, assignedLeadProgress = {} }: Props) {
  const [unassigned, setUnassigned] = useState(unassignedLeads);
  const [assigned, setAssigned] = useState(assignedLeads);
  const [tab, setTab] = useState('unassigned');
  const [leadTypeFilter, setLeadTypeFilter] = useState<'all' | 'rental' | 'buyer'>('all');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<BrokerSortKey>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  // Count badges
  const allLeads = [...unassigned, ...assigned];
  const leadTypeCounts = useMemo(() => ({
    all: allLeads.length,
    rental: allLeads.filter((l) => (l.leadType ?? 'rental') === 'rental').length,
    buyer: allLeads.filter((l) => (l.leadType ?? 'rental') === 'buyer').length,
  }), [allLeads]);
  const scoreCounts = useMemo(() => ({
    all: allLeads.length,
    hot: allLeads.filter((l) => l.scoreLabel?.toLowerCase() === 'hot').length,
    warm: allLeads.filter((l) => l.scoreLabel?.toLowerCase() === 'warm').length,
    cold: allLeads.filter((l) => l.scoreLabel?.toLowerCase() === 'cold').length,
  }), [allLeads]);

  const applySearchAndSort = useCallback((list: LeadRow[]) => {
    let result = list;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q),
      );
    }
    // Score filter
    if (scoreFilter !== 'all') {
      result = result.filter((l) => l.scoreLabel?.toLowerCase() === scoreFilter);
    }
    if (sortBy === 'oldest') {
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'score') {
      result = [...result].sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    } else if (sortBy === 'score-low') {
      result = [...result].sort((a, b) => (a.leadScore ?? Infinity) - (b.leadScore ?? Infinity));
    } else if (sortBy === 'name-az') {
      result = [...result].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    } else if (sortBy === 'name-za') {
      result = [...result].sort((a, b) => (b.name ?? '').localeCompare(a.name ?? ''));
    }
    return result;
  }, [search, sortBy, scoreFilter]);

  const filteredUnassigned = useMemo(() => {
    let list = leadTypeFilter === 'all' ? unassigned : unassigned.filter((l) => (l.leadType ?? 'rental') === leadTypeFilter);
    return applySearchAndSort(list);
  }, [unassigned, leadTypeFilter, applySearchAndSort]);

  const filteredAssigned = useMemo(() => {
    let list = leadTypeFilter === 'all' ? assigned : assigned.filter((l) => (l.leadType ?? 'rental') === leadTypeFilter);
    return applySearchAndSort(list);
  }, [assigned, leadTypeFilter, applySearchAndSort]);

  function handleAssigned(leadId: string, realtor: RealtorOption) {
    const lead = unassigned.find((l) => l.id === leadId);
    if (!lead) return;

    setUnassigned((prev) => prev.filter((l) => l.id !== leadId));
    setAssigned((prev) => [
      {
        ...lead,
        assignedTo: realtor.name ?? realtor.email,
        assignedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setTab('assigned');
  }

  function handleUnassigned(leadId: string, _realtorName: string) {
    const lead = assigned.find((l) => l.id === leadId);
    if (!lead) return;

    setAssigned((prev) => prev.filter((l) => l.id !== leadId));
    setUnassigned((prev) => [
      {
        ...lead,
        assignedTo: null,
        assignedAt: null,
      },
      ...prev,
    ]);
    setTab('unassigned');
  }

  function handleLeadAdded(lead: LeadRow) {
    setUnassigned((prev) => [lead, ...prev]);
    setTab('unassigned');
  }

  return (
    <div className="space-y-4">
    {/* Add Lead Dialog */}
    <AddLeadDialog
      open={addLeadOpen}
      onOpenChange={setAddLeadOpen}
      onLeadAdded={handleLeadAdded}
    />

    {/* Search and controls */}
    <div className="flex flex-col sm:flex-row gap-2.5">
      <div className="relative flex-1">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        {/* Add Lead button */}
        <button
          onClick={() => setAddLeadOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          Add Lead
        </button>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('card')}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              viewMode === 'card'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Card view"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              viewMode === 'table'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Table view"
          >
            <List size={14} />
          </button>
        </div>

        {/* Sort dropdown */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as BrokerSortKey)}
            className="appearance-none rounded-md border border-border bg-card pl-7 pr-8 py-2 text-xs font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring h-9"
          >
            {BROKER_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>

        {/* Lead type filter */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['all', 'rental', 'buyer'] as const).map((lt) => (
            <button
              key={lt}
              onClick={() => setLeadTypeFilter(lt)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                leadTypeFilter === lt
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {lt === 'all' ? 'All' : lt === 'rental' ? 'Rental' : 'Buyer'}
              <span className="tabular-nums opacity-60">{leadTypeCounts[lt]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* Score filter pills */}
    <div className="flex flex-wrap items-center gap-1.5">
      {(['all', 'hot', 'warm', 'cold'] as const).map((key) => {
        const count = scoreCounts[key];
        if (key !== 'all' && count === 0) return null;
        return (
          <button
            key={key}
            onClick={() => setScoreFilter(key)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              scoreFilter === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
            }`}
          >
            {key === 'all' ? 'All Scores' : key.charAt(0).toUpperCase() + key.slice(1)}
            <span className={`tabular-nums ${scoreFilter === key ? 'opacity-80' : 'opacity-60'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>

    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="unassigned" className="gap-1.5">
          <PhoneIncoming size={14} />
          Unassigned
          {filteredUnassigned.length > 0 && (
            <span className="ml-1 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold tabular-nums">
              {filteredUnassigned.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="assigned" className="gap-1.5">
          <Users size={14} />
          Assigned
          {filteredAssigned.length > 0 && (
            <span className="ml-1 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-semibold tabular-nums">
              {filteredAssigned.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="unassigned">
        {filteredUnassigned.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-10 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No unassigned leads.</p>
              <p className="text-xs text-muted-foreground/60">
                New leads tagged &quot;brokerage-lead&quot; will appear here.
              </p>
            </CardContent>
          </Card>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnassigned.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                realtors={realtors}
                onAssigned={handleAssigned}
                onDeleted={(id) => setUnassigned((prev) => prev.filter((l) => l.id !== id))}
              />
            ))}
          </div>
        ) : viewMode === 'table' ? (
          <UnassignedTableView
            leads={filteredUnassigned}
            realtors={realtors}
            onAssigned={handleAssigned}
            onDeleted={(id) => setUnassigned((prev) => prev.filter((l) => l.id !== id))}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              {/* Header */}
              <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <div className="w-9 flex-shrink-0" />
                <div className="flex-1">Lead</div>
                <div className="flex-shrink-0 w-24 text-right">Created</div>
                <div className="flex-shrink-0 w-20" />
              </div>
              {filteredUnassigned.map((lead) => (
                <LeadItem
                  key={lead.id}
                  lead={lead}
                  realtors={realtors}
                  onAssigned={handleAssigned}
                  onDeleted={(id) => setUnassigned((prev) => prev.filter((l) => l.id !== id))}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="assigned">
        {filteredAssigned.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-10 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No assigned leads yet.</p>
            </CardContent>
          </Card>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAssigned.map((lead) => (
              <AssignedLeadCard
                key={lead.id}
                lead={lead}
                progress={assignedLeadProgress[lead.id]}
                onUnassigned={handleUnassigned}
              />
            ))}
          </div>
        ) : viewMode === 'table' ? (
          <AssignedTableView
            leads={filteredAssigned}
            assignedLeadProgress={assignedLeadProgress}
            onUnassigned={handleUnassigned}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <div className="w-9 flex-shrink-0" />
                <div className="flex-1">Lead</div>
                <div className="flex-shrink-0 w-20 text-right">Score</div>
                <div className="flex-shrink-0 w-4" />
              </div>
              {filteredAssigned.map((lead) => (
                <AssignedLeadItem
                  key={lead.id}
                  lead={lead}
                  progress={assignedLeadProgress[lead.id]}
                  onUnassigned={handleUnassigned}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
    </div>
  );
}
