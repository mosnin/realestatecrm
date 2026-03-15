'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  PhoneCall,
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
} from 'lucide-react';
import type { Deal, DealStage, Contact, DealContact, DealActivity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { timeAgo as relativeTime } from '@/lib/formatting';

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
}

const STATUS_META = {
  active: { label: 'Active', icon: Activity, className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  won: { label: 'Won', icon: Trophy, className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  lost: { label: 'Lost', icon: XCircle, className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  on_hold: { label: 'On Hold', icon: PauseCircle, className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

const ACTIVITY_META = {
  note: { label: 'Note', icon: FileText, color: 'text-slate-500' },
  call: { label: 'Call', icon: PhoneCall, color: 'text-blue-500' },
  email: { label: 'Email', icon: Mail, color: 'text-violet-500' },
  meeting: { label: 'Meeting', icon: Users, color: 'text-teal-500' },
  follow_up: { label: 'Follow-up', icon: Clock, color: 'text-amber-500' },
  stage_change: { label: 'Stage change', icon: Activity, color: 'text-indigo-500' },
  status_change: { label: 'Status change', icon: CheckCircle2, color: 'text-green-500' },
};

export function DealPanel({ deal, open, onClose, onEdit, onUpdate }: DealPanelProps) {
  const [tab, setTab] = useState<'overview' | 'activity'>('overview');
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activityType, setActivityType] = useState<string>('note');
  const [activityContent, setActivityContent] = useState('');
  const [postingActivity, setPostingActivity] = useState(false);

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

  useEffect(() => {
    if (open && deal && tab === 'activity') {
      fetchActivities();
    }
  }, [open, deal, tab, fetchActivities]);

  useEffect(() => {
    if (!open) {
      setTab('overview');
      setActivityContent('');
    }
  }, [open]);

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
      }
    } finally {
      setPostingActivity(false);
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!deal) return;
    onUpdate(deal.id, { status: newStatus as Deal['status'] });
  }

  async function handleFollowUpChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!deal) return;
    onUpdate(deal.id, { followUpAt: e.target.value ? new Date(e.target.value) : null });
  }

  if (!deal) return null;

  const statusMeta = STATUS_META[deal.status ?? 'active'];
  const followUpDate = deal.followUpAt ? new Date(deal.followUpAt) : null;
  const followUpOverdue = followUpDate && followUpDate < new Date();
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
            <button
              type="button"
              onClick={() => onEdit(deal)}
              className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Pencil size={14} />
            </button>
          </div>
          {/* Status badge row */}
          <div className="flex flex-wrap gap-2 mt-1">
            <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full', statusMeta.className)}>
              <statusMeta.icon size={11} />
              {statusMeta.label}
            </span>
            {deal.value != null && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full px-2 py-0.5">
                <DollarSign size={10} />
                {deal.value.toLocaleString()}
              </span>
            )}
            {followUpDate && (
              <span className={cn(
                'inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5',
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
          {(['overview', 'activity'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); if (t === 'activity') fetchActivities(); }}
              className={cn(
                'py-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors',
                tab === t
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
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
                        'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border-2 transition-all',
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

          {tab === 'activity' && (
            <div className="space-y-4">
              {/* Add activity */}
              <div className="rounded-xl border border-border p-3 space-y-2.5">
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
                    return (
                      <div key={activity.id} className="flex gap-3">
                        <div className={cn('flex-shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center mt-0.5', meta.color)}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {relativeTime(activity.createdAt)}
                            </span>
                          </div>
                          {activity.content && (
                            <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{activity.content}</p>
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
    </Sheet>
  );
}
