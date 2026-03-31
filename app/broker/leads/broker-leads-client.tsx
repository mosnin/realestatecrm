'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Search, UserPlus, Check, PhoneIncoming, Users, CalendarClock, Handshake, ArrowRight, Clock } from 'lucide-react';
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
              placeholder="Search realtors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground text-center">No realtors found</p>
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

// ── Lead row component ────────────────────────────────────────────────────────

function LeadItem({
  lead,
  realtors,
  onAssigned,
}: {
  lead: LeadRow;
  realtors: RealtorOption[];
  onAssigned: (leadId: string, realtor: RealtorOption) => void;
}) {
  const [assigning, setAssigning] = useState(false);

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
    <div className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">
        {initials(lead.name, lead.email)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{lead.name || 'Unnamed'}</p>
          {scoreBadge(lead.scoreLabel)}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {lead.email && <span>{lead.email}</span>}
          {lead.phone && <span>{lead.phone}</span>}
          {lead.budget != null && <span>Budget: {formatCompact(lead.budget)}</span>}
          {lead.moveTiming && <span>Move: {lead.moveTiming}</span>}
        </div>
      </div>

      {/* Date */}
      <p className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0 hidden sm:block">
        {formatDate(lead.createdAt)}
      </p>

      {/* Assign */}
      <RealtorPicker realtors={realtors} onSelect={(r) => handleAssign(r)} disabled={assigning} />
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
}: {
  lead: LeadRow;
  progress?: AssignedLeadProgress;
}) {
  const [expanded, setExpanded] = useState(false);

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

        {/* Score */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(progress?.currentScore ?? lead.leadScore) != null && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Score: {progress?.currentScore ?? lead.leadScore}
            </span>
          )}
          {progress && (
            <ArrowRight
              size={14}
              className={`text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          )}
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && progress && (
        <div className="px-4 pb-3 pl-[calc(36px+1rem)]">
          <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-2">
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
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BrokerLeadsClient({ unassignedLeads, assignedLeads, realtors, assignedLeadProgress = {} }: Props) {
  const [unassigned, setUnassigned] = useState(unassignedLeads);
  const [assigned, setAssigned] = useState(assignedLeads);
  const [tab, setTab] = useState('unassigned');

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

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="unassigned" className="gap-1.5">
          <PhoneIncoming size={14} />
          Unassigned
          {unassigned.length > 0 && (
            <span className="ml-1 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold tabular-nums">
              {unassigned.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="assigned" className="gap-1.5">
          <Users size={14} />
          Assigned
          {assigned.length > 0 && (
            <span className="ml-1 inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-semibold tabular-nums">
              {assigned.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="unassigned">
        {unassigned.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-10 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No unassigned leads.</p>
              <p className="text-xs text-muted-foreground/60">
                New leads tagged &quot;brokerage-lead&quot; will appear here.
              </p>
            </CardContent>
          </Card>
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
              {unassigned.map((lead) => (
                <LeadItem
                  key={lead.id}
                  lead={lead}
                  realtors={realtors}
                  onAssigned={handleAssigned}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="assigned">
        {assigned.length === 0 ? (
          <Card>
            <CardContent className="px-5 py-10 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No assigned leads yet.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <div className="w-9 flex-shrink-0" />
                <div className="flex-1">Lead</div>
                <div className="flex-shrink-0 w-20 text-right">Score</div>
                <div className="flex-shrink-0 w-4" />
              </div>
              {assigned.map((lead) => (
                <AssignedLeadItem
                  key={lead.id}
                  lead={lead}
                  progress={assignedLeadProgress[lead.id]}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  );
}
