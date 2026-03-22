'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  DollarSign,
  Briefcase,
  Users,
  PawPrint,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  List,
  UserCheck,
  Flame,
  Thermometer,
  Snowflake,
  HelpCircle,
  CalendarDays,
  CheckCircle2,
  Tag,
  Download,
  Bookmark,
  X,
  CheckSquare,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ConvertLeadDialog } from './convert-lead-dialog';
import type { Contact, ApplicationData, LeadScoreDetails, SavedView } from '@/lib/types';
import { downloadCSV } from '@/lib/csv';
import { timeAgo, formatMoney, getInitials, formatFollowUpDate, toDateInputValue } from '@/lib/formatting';
import { LEAD_TIERS, type TierKey } from '@/lib/constants';
import { toast } from 'sonner';

const TIERS = LEAD_TIERS;

function getTierKey(lead: Contact): TierKey {
  if (lead.scoringStatus !== 'scored' || !lead.scoreLabel) return 'unscored';
  if (lead.scoreLabel === 'hot') return 'hot';
  if (lead.scoreLabel === 'warm') return 'warm';
  if (lead.scoreLabel === 'cold') return 'cold';
  return 'unscored';
}

// ── Score circle ─────────────────────────────────────────────────────────────

function ScoreHero({ lead }: { lead: Contact }) {
  const tierKey = getTierKey(lead);
  const tier = TIERS[tierKey];
  const TierIcon = tier.icon;
  const score = lead.leadScore != null ? Math.round(lead.leadScore) : null;

  return (
    <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', tier.bg)}>
      <div className={cn('w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ring-2', tier.ring, tier.scoreBg)}>
        {score != null ? (
          <span className="text-white font-bold text-lg tabular-nums leading-none">{score}</span>
        ) : (
          <TierIcon size={20} className="text-white opacity-80" />
        )}
      </div>
      <div>
        <div className={cn('flex items-center gap-1.5 font-semibold text-sm', tier.text)}>
          <TierIcon size={14} />
          {tier.label} lead
          {lead.scoringStatus === 'pending' && (
            <span className="text-xs font-normal opacity-70">(scoring…)</span>
          )}
        </div>
        {lead.scoreSummary ? (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {lead.scoreSummary}
          </p>
        ) : lead.scoringStatus === 'pending' ? (
          <p className="text-xs text-muted-foreground mt-0.5">AI analysis in progress…</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">No score available</p>
        )}
      </div>
    </div>
  );
}

// ── Qualification chip ───────────────────────────────────────────────────────

function QChip({ icon: Icon, label, highlight, href }: { icon: React.ComponentType<{ size: number }>; label: string; highlight?: boolean; href?: string }) {
  const cls = cn(
    'inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5',
    highlight ? 'bg-primary/8 text-primary font-medium' : 'bg-muted text-muted-foreground',
  );
  if (href) {
    return (
      <a href={href} className={cn(cls, 'hover:underline underline-offset-2')}>
        <Icon size={11} />
        {label}
      </a>
    );
  }
  return (
    <div className={cls}>
      <Icon size={11} />
      {label}
    </div>
  );
}

// ── Tier filter pill ─────────────────────────────────────────────────────────

type TierFilter = 'all' | TierKey;

const TIER_FILTERS: { key: TierFilter; label: string; icon?: React.ComponentType<{ size: number }> }[] = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: 'Hot', icon: Flame },
  { key: 'warm', label: 'Warm', icon: Thermometer },
  { key: 'cold', label: 'Cold', icon: Snowflake },
  { key: 'unscored', label: 'Unscored' },
];

// ── Main component ───────────────────────────────────────────────────────────

interface LeadsViewProps {
  leads: Contact[];
  slug: string;
  newLeadIds: Set<string>;
}

export function LeadsView({ leads: initialLeads, slug, newLeadIds }: LeadsViewProps) {
  const [leads, setLeads] = useState<Contact[]>(initialLeads);
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sort, setSort] = useState<'newest' | 'score' | 'followup'>('newest');
  const [view, setView] = useState<'card' | 'list'>('card');
  const [convertTarget, setConvertTarget] = useState<Contact | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);

  // Load saved views from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`saved-views-leads-${slug}`);
      if (stored) setSavedViews(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [slug]);

  // Escape clears selection
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedIds(new Set());
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function persistSavedViews(views: SavedView[]) {
    setSavedViews(views);
    localStorage.setItem(`saved-views-leads-${slug}`, JSON.stringify(views));
  }

  function handleSaveView() {
    if (!saveViewName.trim()) return;
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name: saveViewName.trim(),
      page: 'leads',
      filters: { tierFilter, sort },
    };
    persistSavedViews([...savedViews, newView]);
    setSaveViewName('');
    setShowSaveInput(false);
  }

  function applyView(v: SavedView) {
    const f = v.filters as { tierFilter?: TierFilter; sort?: 'newest' | 'score' | 'followup' };
    if (f.tierFilter) setTierFilter(f.tierFilter);
    if (f.sort) setSort(f.sort);
  }

  function deleteView(id: string) {
    persistSavedViews(savedViews.filter((v) => v.id !== id));
  }

  const filtered = useMemo(() => {
    let list = tierFilter === 'all' ? leads : leads.filter((l) => getTierKey(l) === tierFilter);
    if (sort === 'score') {
      list = [...list].sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    } else if (sort === 'followup') {
      list = [...list].sort((a, b) => {
        const aTime = a.followUpAt ? new Date(a.followUpAt).getTime() : Infinity;
        const bTime = b.followUpAt ? new Date(b.followUpAt).getTime() : Infinity;
        return aTime - bTime;
      });
    }
    return list;
  }, [leads, tierFilter, sort]);

  function handleConverted(leadId: string) {
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
  }

  const patchLead = useCallback(async (id: string, patch: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        toast.error('Failed to update lead');
        return;
      }
      const updated = await res.json();
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...updated } : l)));
      if ('followUpAt' in patch) {
        toast.success(patch.followUpAt ? 'Follow-up date set' : 'Follow-up date cleared');
      } else if ('lastContactedAt' in patch) {
        toast.success('Marked as contacted');
      }
    } catch {
      toast.error('Failed to update lead');
    }
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (!confirm(`Delete ${ids.length} lead${ids.length !== 1 ? 's' : ''}?`)) return;
    try {
      const results = await Promise.all(ids.map((id) => fetch(`/api/contacts/${id}`, { method: 'DELETE' })));
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        toast.error(`Failed to delete ${failed} of ${ids.length} leads`);
      } else {
        toast.success(`Deleted ${ids.length} leads`);
      }
      // Only remove successfully deleted leads from UI
      const successIds = ids.filter((_, i) => results[i].ok);
      setLeads((prev) => prev.filter((l) => !successIds.includes(l.id)));
    } catch {
      toast.error('Failed to delete leads');
    }
    setSelectedIds(new Set());
  }

  function handleExportSelected() {
    const toExport = filtered.filter((l) => selectedIds.has(l.id));
    exportLeadsCSV(toExport);
  }

  function handleExportAll() {
    exportLeadsCSV(filtered);
  }

  function exportLeadsCSV(items: Contact[]) {
    toast.success('Leads exported');
    downloadCSV('leads.csv', items.map((l) => {
      const app = l.applicationData as ApplicationData | null;
      return {
        Name: l.name,
        Phone: l.phone ?? '',
        Email: l.email ?? '',
        Score: l.leadScore != null ? Math.round(l.leadScore) : '',
        Tier: l.scoreLabel ?? '',
        'Score summary': l.scoreSummary ?? '',
        Employment: app?.employmentStatus ?? '',
        'Monthly income': app?.monthlyGrossIncome ?? '',
        'Monthly rent': app?.monthlyRent ?? (l.budget ?? ''),
        'Follow-up': l.followUpAt ? new Date(l.followUpAt).toLocaleDateString('en-US') : '',
        Submitted: new Date(l.createdAt).toLocaleDateString('en-US'),
      };
    }));
  }

  const leadViews = savedViews.filter((v) => v.page === 'leads');

  return (
    <div className="space-y-4">
      {/* Saved view chips */}
      {leadViews.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-1">Saved:</span>
          {leadViews.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 text-xs font-medium bg-muted rounded-full pl-2.5 pr-1 py-1">
              <button type="button" onClick={() => applyView(v)} className="hover:text-foreground transition-colors">
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => deleteView(v.id)}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Controls bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tier filter pills */}
        <div className="flex gap-1 flex-wrap">
          {TIER_FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTierFilter(key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                tierFilter === key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80',
              )}
            >
              {Icon && <Icon size={11} />}
              {label}
              {key !== 'all' && (
                <span className={cn(
                  'ml-0.5 tabular-nums',
                  tierFilter === key ? 'opacity-80' : 'opacity-60',
                )}>
                  {leads.filter((l) => getTierKey(l) === key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto flex-wrap">
          {/* Sort */}
          <div className="flex rounded-md border border-border overflow-hidden bg-card text-xs">
            <button
              type="button"
              onClick={() => setSort('newest')}
              className={cn(
                'px-2.5 py-1.5 transition-colors',
                sort === 'newest' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => setSort('score')}
              className={cn(
                'px-2.5 py-1.5 flex items-center gap-1 transition-colors',
                sort === 'score' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <Sparkles size={11} />
              Top score
            </button>
            <button
              type="button"
              onClick={() => setSort('followup')}
              className={cn(
                'px-2.5 py-1.5 flex items-center gap-1 transition-colors',
                sort === 'followup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <CalendarDays size={11} />
              Follow-up
            </button>
          </div>

          {/* Save view */}
          {showSaveInput ? (
            <div className="flex gap-1">
              <input
                ref={saveInputRef}
                type="text"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="View name…"
                className="text-xs rounded-md border border-input bg-card px-2 py-1 w-28 focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveView();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveView}
                className="text-xs px-2 py-1 rounded-md border border-border bg-card hover:bg-muted transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowSaveInput(false)}
                className="text-xs px-1.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowSaveInput(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Bookmark size={11} />
              Save view
            </button>
          )}

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download size={11} />
            Export
          </button>

          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden bg-card">
            <button
              type="button"
              onClick={() => setView('card')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'px-2.5 py-1.5 flex items-center justify-center transition-colors',
                view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center px-6">
          <p className="font-semibold text-foreground mb-1">No {tierFilter !== 'all' ? tierFilter : ''} leads</p>
          <p className="text-sm text-muted-foreground">
            {tierFilter !== 'all' ? 'Try a different filter.' : 'Share your intake link to receive applications.'}
          </p>
        </div>
      )}

      {/* ── Card view ── */}
      {view === 'card' && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((lead) => {
            const isNew = newLeadIds.has(lead.id);
            const app = lead.applicationData as ApplicationData | null;
            const details = lead.scoreDetails as LeadScoreDetails | null;
            const budget = app?.monthlyRent ?? lead.budget;
            const tierKey = getTierKey(lead);
            const tier = TIERS[tierKey];
            const riskFlags = (details?.riskFlags ?? []).filter((f) => f !== 'none');
            const isSelected = selectedIds.has(lead.id);

            return (
              <div
                key={lead.id}
                className={cn(
                  'rounded-lg border bg-card overflow-hidden transition-all duration-150 hover:shadow-md',
                  isSelected ? 'border-primary/40 bg-primary/5' :
                  tierKey === 'hot' ? 'border-emerald-200/80 dark:border-emerald-800/50' :
                  tierKey === 'warm' ? 'border-amber-200/80 dark:border-amber-800/50' :
                  'border-border',
                )}
              >
                {/* Header */}
                <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(lead.id)}
                      className="rounded border-border cursor-pointer flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ opacity: isSelected ? 1 : undefined }}
                    />
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                      {getInitials(lead.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/s/${slug}/contacts/${lead.id}`}
                          className="font-semibold text-[15px] leading-tight hover:text-primary transition-colors"
                        >
                          {lead.name}
                        </Link>
                        {isNew && (
                          <span className="inline-flex text-[10px] font-bold text-primary bg-primary/10 rounded-md px-2 py-0.5 flex-shrink-0">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <Clock size={11} />
                        {timeAgo(new Date(lead.createdAt))}
                        {lead.sourceLabel && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="inline-flex items-center gap-1">
                              <Tag size={10} />
                              {lead.sourceLabel === 'intake-form' ? 'Intake form' : lead.sourceLabel === 'tour-booking' ? 'Tour booking' : lead.sourceLabel}
                            </span>
                          </>
                        )}
                        {lead.lastContactedAt && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={10} />
                              Contacted {timeAgo(new Date(lead.lastContactedAt))}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Convert button */}
                  <button
                    type="button"
                    onClick={() => setConvertTarget(lead)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary border border-border hover:border-primary/40 rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <UserCheck size={12} />
                    <span className="hidden sm:inline">Convert</span>
                  </button>
                </div>

                {/* Score hero */}
                <div className="px-4 pb-3">
                  <ScoreHero lead={lead} />
                </div>

                {/* Key qualification data */}
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {lead.phone && <QChip icon={Phone} label={lead.phone} href={`tel:${lead.phone}`} />}
                  {lead.email && <QChip icon={Mail} label={lead.email} href={`mailto:${lead.email}`} />}
                  {budget != null && <QChip icon={DollarSign} label={`${formatMoney(budget)}/mo`} highlight />}
                  {app?.employmentStatus && <QChip icon={Briefcase} label={app.employmentStatus} />}
                  {app?.monthlyGrossIncome != null && (
                    <QChip icon={DollarSign} label={`${formatMoney(app.monthlyGrossIncome)} income`} />
                  )}
                  {(app?.adultsOnApplication != null) && (
                    <QChip icon={Users} label={`${app.adultsOnApplication} adult${app.adultsOnApplication !== 1 ? 's' : ''}${(app.childrenOrDependents ?? 0) > 0 ? ` · ${app.childrenOrDependents} child${app.childrenOrDependents !== 1 ? 'ren' : ''}` : ''}`} />
                  )}
                  {app?.hasPets && <QChip icon={PawPrint} label={app.petDetails ?? 'Has pets'} />}
                  {lead.preferences && <QChip icon={MapPin} label={lead.preferences} />}
                </div>

                {/* Explanation tags */}
                {details?.explanationTags && details.explanationTags.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {details.explanationTags.slice(0, 5).map((tag) => (
                      <span key={tag} className={cn('inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5', tier.pill)}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Risk flags */}
                {riskFlags.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1">
                    {riskFlags.slice(0, 3).map((flag) => (
                      <span key={flag} className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 bg-destructive/10 text-destructive">
                        <AlertTriangle size={9} />
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Recommended action + follow-up row */}
                <div className="px-4 pb-4 border-t border-border/60 pt-3 flex items-center justify-between gap-3 flex-wrap">
                  {details?.recommendedNextAction ? (
                    <p className="text-xs text-primary font-medium flex items-center gap-1.5 min-w-0 flex-1">
                      <ArrowRight size={11} className="flex-shrink-0" />
                      <span className="truncate">{details.recommendedNextAction}</span>
                    </p>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Follow-up date */}
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer group/fu">
                      <CalendarDays size={11} className={cn(lead.followUpAt ? 'text-primary' : 'text-muted-foreground')} />
                      {lead.followUpAt ? (
                        <span className={cn(
                          'font-medium',
                          new Date(lead.followUpAt) < new Date() ? 'text-destructive' : 'text-primary',
                        )}>
                          {formatFollowUpDate(lead.followUpAt)}
                        </span>
                      ) : (
                        <span className="group-hover/fu:text-foreground transition-colors">Follow-up</span>
                      )}
                      <input
                        type="date"
                        className="sr-only"
                        value={toDateInputValue(lead.followUpAt)}
                        onChange={(e) => patchLead(lead.id, { followUpAt: e.target.value || null })}
                      />
                    </label>
                    {/* Mark contacted */}
                    <button
                      type="button"
                      onClick={() => patchLead(lead.id, { lastContactedAt: new Date().toISOString() })}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-medium rounded-md px-2 py-1 transition-colors',
                        lead.lastContactedAt
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100'
                          : 'text-muted-foreground bg-muted hover:text-foreground hover:bg-muted/80',
                      )}
                      title="Mark as contacted now"
                    >
                      <CheckCircle2 size={11} />
                      {lead.lastContactedAt ? 'Contacted' : 'Mark contacted'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && filtered.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Follow-up</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filtered.map((lead) => {
                  const isNew = newLeadIds.has(lead.id);
                  const app = lead.applicationData as ApplicationData | null;
                  const budget = app?.monthlyRent ?? lead.budget;
                  const tierKey = getTierKey(lead);
                  const tier = TIERS[tierKey];
                  const score = lead.leadScore != null ? Math.round(lead.leadScore) : null;
                  const isSelected = selectedIds.has(lead.id);

                  return (
                    <tr
                      key={lead.id}
                      className={cn(
                        'group hover:bg-muted/30 transition-colors',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded border-border cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/s/${slug}/contacts/${lead.id}`} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {getInitials(lead.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium hover:text-primary transition-colors">{lead.name}</span>
                              {isNew && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-md px-1.5 py-0.5">NEW</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1', tier.pill)}>
                          {score != null ? `${score} ·` : ''} {tier.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="space-y-0.5">
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]">
                              <Mail size={10} className="flex-shrink-0" />
                              {lead.email}
                            </a>
                          )}
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Phone size={10} className="flex-shrink-0" />
                              {lead.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {budget != null ? `${formatMoney(budget)}/mo` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {timeAgo(new Date(lead.createdAt))}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <CalendarDays size={10} className={lead.followUpAt ? 'text-primary' : 'text-muted-foreground'} />
                          <span className={cn(
                            lead.followUpAt
                              ? new Date(lead.followUpAt) < new Date() ? 'text-destructive font-medium' : 'text-primary font-medium'
                              : 'text-muted-foreground',
                          )}>
                            {lead.followUpAt ? formatFollowUpDate(lead.followUpAt) : '—'}
                          </span>
                          <input
                            type="date"
                            className="sr-only"
                            value={toDateInputValue(lead.followUpAt)}
                            onChange={(e) => patchLead(lead.id, { followUpAt: e.target.value || null })}
                          />
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setConvertTarget(lead)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-medium"
                        >
                          <UserCheck size={12} />
                          Convert
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-border bg-card shadow-lg px-4 py-3">
          <CheckSquare size={14} className="text-primary" />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <button
            type="button"
            onClick={handleExportSelected}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <Download size={12} />
            Export
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Convert dialog */}
      {convertTarget && (
        <ConvertLeadDialog
          open={!!convertTarget}
          onOpenChange={(o) => !o && setConvertTarget(null)}
          leadName={convertTarget.name}
          leadId={convertTarget.id}
          currentTags={convertTarget.tags}
          onConverted={handleConverted}
        />
      )}
    </div>
  );
}
