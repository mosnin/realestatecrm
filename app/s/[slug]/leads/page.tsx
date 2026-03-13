import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
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
} from 'lucide-react';
import Link from 'next/link';
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
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function tierBadgeClasses(label: string | null) {
  if (label === 'hot') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  if (label === 'warm') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400';
}

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) redirect('/');

  let leads: Contact[] = [];
  try {
    const { data, error } = await supabase.from('Contact').select('*').eq('spaceId', space.id).contains('tags', ['application-link']).order('createdAt', { ascending: false }).limit(100);
    if (error) throw error;
    leads = (data ?? []) as Contact[];
  } catch (err) {
    console.error('[leads] DB query failed', { slug, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your leads. This is usually temporary.</p>
          <a href={`/s/${slug}/leads`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  const unreadLeads = leads.filter((lead) => lead.tags.includes('new-lead'));

  if (unreadLeads.length) {
    try {
      await Promise.all(
        unreadLeads.map(async (lead) => {
          const newTags = (lead.tags ?? []).filter((t: string) => t !== 'new-lead');
          await supabase.from('Contact').update({ tags: newTags, updatedAt: new Date().toISOString() }).eq('id', lead.id);
        })
      );
    } catch {
      // non-blocking
    }
  }

  const newCount = unreadLeads.length;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Renter applications submitted via your intake link
          </p>
        </div>
        {newCount > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-primary font-medium bg-primary/8 rounded-full px-3 py-1 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {newCount} new
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground border-b border-border pb-4">
        <span>
          <strong className="text-foreground font-semibold">{leads.length}</strong>{' '}
          {leads.length === 1 ? 'application' : 'applications'}
        </span>
        {newCount > 0 && (
          <span className="text-primary">
            <strong className="font-semibold">{newCount}</strong> unread
          </span>
        )}
      </div>

      {/* Lead cards */}
      {leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Phone size={20} className="text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">No leads yet</p>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Share your intake link and new renter applications will appear here.
          </p>
          <Link
            href={`/s/${slug}`}
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary font-medium hover:underline underline-offset-2"
          >
            Get your intake link →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const isNew = unreadLeads.some((u) => u.id === lead.id);
            const app = lead.applicationData as ApplicationData | null;
            const details = lead.scoreDetails as LeadScoreDetails | null;

            // Parse timeline from notes (legacy) or app data
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
                {/* Card top: name, score, time */}
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

                    {/* Score badge (right side) */}
                    {lead.scoringStatus === 'scored' && lead.leadScore != null && (
                      <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 font-semibold flex-shrink-0 ${tierBadgeClasses(lead.scoreLabel)}`}>
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

                {/* Info chips */}
                <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                  {lead.phone && (
                    <Chip icon={Phone}>{lead.phone}</Chip>
                  )}
                  {lead.email && (
                    <Chip icon={Mail}><span className="max-w-[140px] truncate">{lead.email}</span></Chip>
                  )}
                  {(app?.monthlyRent != null || lead.budget != null) && (
                    <Chip icon={DollarSign} highlight>
                      {formatBudget((app?.monthlyRent ?? lead.budget)!)}/mo
                    </Chip>
                  )}
                  {timeline && (
                    <Chip icon={Clock}>Move-in: {timeline}</Chip>
                  )}
                  {app?.employmentStatus && (
                    <Chip icon={Briefcase}>{app.employmentStatus}</Chip>
                  )}
                  {app?.monthlyGrossIncome != null && (
                    <Chip icon={DollarSign}>Income: {formatBudget(app.monthlyGrossIncome)}/mo</Chip>
                  )}
                  {(app?.adultsOnApplication != null || app?.childrenOrDependents != null) && (
                    <Chip icon={Users}>
                      {app?.adultsOnApplication ?? '?'} adult{(app?.adultsOnApplication ?? 0) !== 1 ? 's' : ''}
                      {(app?.childrenOrDependents ?? 0) > 0 ? `, ${app!.childrenOrDependents} child${app!.childrenOrDependents !== 1 ? 'ren' : ''}` : ''}
                    </Chip>
                  )}
                  {app?.hasPets === true && (
                    <Chip icon={PawPrint}>{app.petDetails ?? 'Has pets'}</Chip>
                  )}
                  {lead.preferences && (
                    <Chip icon={MapPin}><span className="max-w-[140px] truncate">{lead.preferences}</span></Chip>
                  )}
                </div>

                {/* Explanation tags from scoring */}
                {details?.explanationTags && details.explanationTags.length > 0 && (
                  <div className="px-5 pb-3 flex flex-wrap gap-1">
                    {details.explanationTags.slice(0, 4).map((tag) => (
                      <span key={tag} className="inline-flex items-center text-[10px] font-medium rounded-full px-2 py-0.5 bg-primary/5 text-primary">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Risk flags */}
                {details?.riskFlags && details.riskFlags.length > 0 && details.riskFlags[0] !== 'none' && (
                  <div className="px-5 pb-3 flex flex-wrap gap-1">
                    {details.riskFlags.slice(0, 3).map((flag) => (
                      <span key={flag} className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 bg-destructive/10 text-destructive">
                        <AlertTriangle size={9} />
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Score summary + next action */}
                {lead.scoreSummary && (
                  <div className="px-5 pb-3 border-t border-border/60 pt-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">{lead.scoreSummary}</p>
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
      )}
    </div>
  );
}

function Chip({ icon: Icon, children, highlight }: { icon: React.ComponentType<{ size: number }>; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 ${
      highlight
        ? 'bg-primary/8 text-primary font-medium'
        : 'bg-muted text-muted-foreground'
    }`}>
      <Icon size={11} />
      {children}
    </div>
  );
}
