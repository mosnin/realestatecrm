import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSlug } from '@/lib/space';
import { Phone, Mail, MapPin, Clock, DollarSign, FileText } from 'lucide-react';
import Link from 'next/link';

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

  const leads = await db.contact.findMany({
    where: { spaceId: space.id, tags: { has: 'application-link' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const unreadLeads = leads.filter((lead) => lead.tags.includes('new-lead'));

  if (unreadLeads.length) {
    await Promise.all(
      unreadLeads.map((lead) =>
        db.contact.update({
          where: { id: lead.id },
          data: { tags: lead.tags.filter((tag) => tag !== 'new-lead') },
        })
      )
    );
  }

  const newCount = unreadLeads.length;

  return (
    <div className="space-y-5 max-w-3xl">
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
            const isNew = unreadLeads.some((u) => u.id === lead.id) ||
              // If we just cleared them, they were new when page loaded
              // Show the left accent for recent leads (< 24h) as a freshness signal
              (Date.now() - new Date(lead.createdAt).getTime() < 86400000 && lead.tags.includes('application-link') && !lead.tags.includes('new-lead'));

            // Parse timeline + notes from the notes field (formatted as "Timeline: X\nnotes")
            let timeline = '';
            let notes = '';
            if (lead.notes) {
              const lines = lead.notes.split('\n');
              const timelineLine = lines.find((l) => l.startsWith('Timeline:'));
              if (timelineLine) {
                timeline = timelineLine.replace('Timeline:', '').trim();
                notes = lines.filter((l) => !l.startsWith('Timeline:')).join('\n').trim();
              } else {
                notes = lead.notes;
              }
            }

            return (
              <div
                key={lead.id}
                className="group rounded-xl border border-border bg-card overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px"
              >
                {/* Card top: name, status, time */}
                <div className="px-5 pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                        {getInitials(lead.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-[15px] leading-tight">{lead.name}</p>
                          {newCount > 0 && unreadLeads.some((u) => u.id === lead.id) ? (
                            <span className="inline-flex text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 flex-shrink-0">
                              NEW
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                          <Clock size={11} />
                          {timeAgo(new Date(lead.createdAt))}
                          <span className="ml-1 text-muted-foreground/50">·</span>
                          <span>via intake link</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info chips */}
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                  {lead.phone && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5 text-muted-foreground">
                      <Phone size={11} />
                      <span>{lead.phone}</span>
                    </div>
                  )}
                  {lead.email && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5 text-muted-foreground">
                      <Mail size={11} />
                      <span className="max-w-[160px] truncate">{lead.email}</span>
                    </div>
                  )}
                  {lead.budget != null && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-primary/8 rounded-md px-2.5 py-1.5 text-primary font-medium">
                      <DollarSign size={11} />
                      <span>{formatBudget(lead.budget)}/mo</span>
                    </div>
                  )}
                  {lead.scoringStatus === 'scored' && lead.leadScore != null && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 rounded-md px-2.5 py-1.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 font-medium">
                      <span>Score {Math.round(lead.leadScore)}</span>
                      <span className="uppercase">{lead.scoreLabel ?? 'hot'}</span>
                    </div>
                  )}
                  {lead.scoringStatus === 'failed' && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5 text-muted-foreground">
                      <span>Unscored</span>
                    </div>
                  )}
                  {lead.scoringStatus === 'pending' && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-amber-50 rounded-md px-2.5 py-1.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                      <span>Scoring pending</span>
                    </div>
                  )}
                  {timeline && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5 text-muted-foreground">
                      <Clock size={11} />
                      <span>Move-in: {timeline}</span>
                    </div>
                  )}
                  {lead.preferences && (
                    <div className="inline-flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5 text-muted-foreground">
                      <MapPin size={11} />
                      <span className="max-w-[160px] truncate">{lead.preferences}</span>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {notes && (
                  <div className="px-5 pb-4 border-t border-border/60 pt-3">
                    <div className="flex items-start gap-2 text-xs text-muted-foreground">
                      <FileText size={12} className="mt-0.5 flex-shrink-0" />
                      <p className="leading-relaxed line-clamp-3">{notes}</p>
                    </div>
                  </div>
                )}
                {lead.scoreSummary && (
                  <div className="px-5 pb-4 border-t border-border/60 pt-3">
                    <p className="text-xs text-muted-foreground">Scoring note: {lead.scoreSummary}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
