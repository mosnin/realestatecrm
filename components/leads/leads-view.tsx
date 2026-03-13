'use client';

import { useState } from 'react';
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  DollarSign,
  FileText,
  Briefcase,
  Users,
  PawPrint,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  LayoutGrid,
  List,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Contact, ApplicationData, LeadScoreDetails } from '@/lib/types';

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

function formatBudget(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function tierBadgeClasses(label: string | null) {
  if (label === 'hot') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  if (label === 'warm') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400';
}

function Chip({
  icon: Icon,
  children,
  highlight,
}: {
  icon: React.ComponentType<{ size: number }>;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 ${
        highlight ? 'bg-primary/8 text-primary font-medium' : 'bg-muted text-muted-foreground'
      }`}
    >
      <Icon size={11} />
      {children}
    </div>
  );
}

interface LeadsViewProps {
  leads: Contact[];
  slug: string;
  newLeadIds: Set<string>;
}

export function LeadsView({ leads, slug, newLeadIds }: LeadsViewProps) {
  const [view, setView] = useState<'card' | 'list'>('card');

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex justify-end">
        <div className="flex rounded-md border border-border overflow-hidden bg-card">
          <button
            type="button"
            onClick={() => setView('card')}
            className={cn(
              'px-2.5 py-1.5 flex items-center justify-center transition-colors',
              view === 'card'
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
      </div>

      {view === 'card' ? (
        <div className="space-y-3">
          {leads.map((lead) => {
            const isNew = newLeadIds.has(lead.id);
            const app = lead.applicationData as ApplicationData | null;
            const details = lead.scoreDetails as LeadScoreDetails | null;

            let timeline = app?.targetMoveInDate ?? '';
            if (!timeline && lead.notes) {
              const lines = lead.notes.split('\n');
              const timelineLine = lines.find((l) => l.startsWith('Timeline:'));
              if (timelineLine) timeline = timelineLine.replace('Timeline:', '').trim();
            }

            return (
              <Link
                key={lead.id}
                href={`/s/${slug}/contacts/${lead.id}`}
                className="group block rounded-xl border border-border bg-card overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px"
              >
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                        {getInitials(lead.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-[15px] leading-tight">{lead.name}</p>
                          {isNew && (
                            <span className="inline-flex text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 flex-shrink-0">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                          <Clock size={11} />
                          {timeAgo(new Date(lead.createdAt))}
                          <span className="ml-1 text-muted-foreground/50">·</span>
                          <span>via intake link</span>
                        </div>
                      </div>
                    </div>

                    {lead.scoringStatus === 'scored' && lead.leadScore != null && (
                      <div
                        className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 font-semibold flex-shrink-0 ${tierBadgeClasses(lead.scoreLabel)}`}
                      >
                        <Sparkles size={11} />
                        <span>{Math.round(lead.leadScore)}</span>
                        <span className="uppercase text-[10px]">{lead.scoreLabel}</span>
                      </div>
                    )}
                    {lead.scoringStatus === 'pending' && (
                      <div className="flex items-center gap-1.5 text-xs bg-amber-50 rounded-lg px-2.5 py-1.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 flex-shrink-0">
                        <span>Scoring...</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                  {lead.phone && <Chip icon={Phone}>{lead.phone}</Chip>}
                  {lead.email && (
                    <Chip icon={Mail}>
                      <span className="max-w-[140px] truncate">{lead.email}</span>
                    </Chip>
                  )}
                  {(app?.monthlyRent != null || lead.budget != null) && (
                    <Chip icon={DollarSign} highlight>
                      {formatBudget((app?.monthlyRent ?? lead.budget)!)}/mo
                    </Chip>
                  )}
                  {timeline && <Chip icon={Clock}>Move-in: {timeline}</Chip>}
                  {app?.employmentStatus && (
                    <Chip icon={Briefcase}>{app.employmentStatus}</Chip>
                  )}
                  {app?.monthlyGrossIncome != null && (
                    <Chip icon={DollarSign}>
                      Income: {formatBudget(app.monthlyGrossIncome)}/mo
                    </Chip>
                  )}
                  {(app?.adultsOnApplication != null || app?.childrenOrDependents != null) && (
                    <Chip icon={Users}>
                      {app?.adultsOnApplication ?? '?'} adult
                      {(app?.adultsOnApplication ?? 0) !== 1 ? 's' : ''}
                      {(app?.childrenOrDependents ?? 0) > 0
                        ? `, ${app!.childrenOrDependents} child${app!.childrenOrDependents !== 1 ? 'ren' : ''}`
                        : ''}
                    </Chip>
                  )}
                  {app?.hasPets === true && (
                    <Chip icon={PawPrint}>{app.petDetails ?? 'Has pets'}</Chip>
                  )}
                  {lead.preferences && (
                    <Chip icon={MapPin}>
                      <span className="max-w-[140px] truncate">{lead.preferences}</span>
                    </Chip>
                  )}
                </div>

                {details?.explanationTags && details.explanationTags.length > 0 && (
                  <div className="px-5 pb-3 flex flex-wrap gap-1">
                    {details.explanationTags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5 bg-primary/5 text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {details?.riskFlags &&
                  details.riskFlags.length > 0 &&
                  details.riskFlags[0] !== 'none' && (
                    <div className="px-5 pb-3 flex flex-wrap gap-1">
                      {details.riskFlags.slice(0, 3).map((flag) => (
                        <span
                          key={flag}
                          className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 bg-destructive/10 text-destructive"
                        >
                          <AlertTriangle size={9} />
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}

                {lead.scoreSummary && (
                  <div className="px-5 pb-3 border-t border-border/60 pt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {lead.scoreSummary}
                    </p>
                    {details?.recommendedNextAction && (
                      <p className="text-xs text-primary font-medium mt-1 flex items-center gap-1">
                        <ArrowRight size={10} />
                        {details.recommendedNextAction}
                      </p>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        /* ── List / table view ── */
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Contact
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">
                    Budget
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                    Score
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {leads.map((lead) => {
                  const isNew = newLeadIds.has(lead.id);
                  const app = lead.applicationData as ApplicationData | null;
                  const budget = app?.monthlyRent ?? lead.budget;

                  return (
                    <tr key={lead.id} className="group hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/s/${slug}/contacts/${lead.id}`}
                          className="flex items-center gap-3"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {getInitials(lead.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium hover:text-primary transition-colors">
                                {lead.name}
                              </span>
                              {isNew && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                                  NEW
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="space-y-0.5">
                          {lead.email && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {lead.email}
                            </p>
                          )}
                          {lead.phone && (
                            <p className="text-xs text-muted-foreground">{lead.phone}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {budget != null ? `${formatBudget(budget)}/mo` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {lead.scoringStatus === 'scored' && lead.leadScore != null ? (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 text-xs rounded-md px-2 py-0.5 font-semibold',
                              tierBadgeClasses(lead.scoreLabel),
                            )}
                          >
                            <Sparkles size={10} />
                            {Math.round(lead.leadScore)} {lead.scoreLabel}
                          </span>
                        ) : lead.scoringStatus === 'pending' ? (
                          <span className="text-xs text-amber-600">Scoring...</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                        {timeAgo(new Date(lead.createdAt))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
