'use client';

import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ConvertLeadDialog } from './convert-lead-dialog';
import type { Contact, ApplicationData, LeadScoreDetails } from '@/lib/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Tier config ─────────────────────────────────────────────────────────────

const TIERS = {
  hot: {
    label: 'Hot',
    icon: Flame,
    ring: 'ring-emerald-400/60',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-400',
    pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    scoreBg: 'bg-emerald-500',
  },
  warm: {
    label: 'Warm',
    icon: Thermometer,
    ring: 'ring-amber-400/60',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-700 dark:text-amber-400',
    pill: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    scoreBg: 'bg-amber-500',
  },
  cold: {
    label: 'Cold',
    icon: Snowflake,
    ring: 'ring-blue-400/60',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    text: 'text-blue-700 dark:text-blue-400',
    pill: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    scoreBg: 'bg-blue-400',
  },
  unscored: {
    label: 'Unscored',
    icon: HelpCircle,
    ring: 'ring-border',
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    pill: 'bg-muted text-muted-foreground',
    scoreBg: 'bg-muted-foreground/30',
  },
} as const;

type TierKey = keyof typeof TIERS;

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
    <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3', tier.bg)}>
      <div className={cn('w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ring-2', tier.ring, tier.scoreBg)}>
        {score != null ? (
          <span className="text-white font-bold text-xl tabular-nums leading-none">{score}</span>
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

function QChip({ icon: Icon, label, highlight }: { icon: React.ComponentType<{ size: number }>; label: string; highlight?: boolean }) {
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5',
      highlight ? 'bg-primary/8 text-primary font-medium' : 'bg-muted text-muted-foreground',
    )}>
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
  const [sort, setSort] = useState<'newest' | 'score'>('newest');
  const [view, setView] = useState<'card' | 'list'>('card');
  const [convertTarget, setConvertTarget] = useState<Contact | null>(null);

  const filtered = useMemo(() => {
    let list = tierFilter === 'all' ? leads : leads.filter((l) => getTierKey(l) === tierFilter);
    if (sort === 'score') {
      list = [...list].sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    }
    return list;
  }, [leads, tierFilter, sort]);

  function handleConverted(leadId: string) {
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
  }

  return (
    <div className="space-y-4">
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

        <div className="flex gap-2 ml-auto">
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
          </div>

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
        <div className="rounded-2xl border border-dashed border-border bg-card py-12 text-center px-6">
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

            return (
              <div
                key={lead.id}
                className={cn(
                  'rounded-xl border bg-card overflow-hidden transition-all duration-150 hover:shadow-md',
                  tierKey === 'hot' ? 'border-emerald-200/80 dark:border-emerald-800/50' :
                  tierKey === 'warm' ? 'border-amber-200/80 dark:border-amber-800/50' :
                  'border-border',
                )}
              >
                {/* Header */}
                <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
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
                          <span className="inline-flex text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 flex-shrink-0">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <Clock size={11} />
                        {timeAgo(new Date(lead.createdAt))}
                        <span className="opacity-40">·</span>
                        <span>via intake link</span>
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
                  {lead.phone && <QChip icon={Phone} label={lead.phone} />}
                  {lead.email && <QChip icon={Mail} label={lead.email} />}
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

                {/* Recommended action */}
                {details?.recommendedNextAction && (
                  <div className="px-4 pb-4 border-t border-border/60 pt-3">
                    <p className="text-xs text-primary font-medium flex items-center gap-1.5">
                      <ArrowRight size={11} />
                      {details.recommendedNextAction}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && filtered.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Submitted</th>
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

                  return (
                    <tr key={lead.id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/s/${slug}/contacts/${lead.id}`} className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {getInitials(lead.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium hover:text-primary transition-colors">{lead.name}</span>
                              {isNew && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">NEW</span>
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
                          {lead.email && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{lead.email}</p>}
                          {lead.phone && <p className="text-xs text-muted-foreground">{lead.phone}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {budget != null ? `${formatMoney(budget)}/mo` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {timeAgo(new Date(lead.createdAt))}
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
