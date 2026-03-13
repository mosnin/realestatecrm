import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  FileText,
  CalendarDays,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import type { Contact } from '@/lib/types';

const TYPE_META: Record<string, { label: string; className: string }> = {
  QUALIFICATION: {
    label: 'Qualifying',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30',
  },
  TOUR: {
    label: 'Tour scheduled',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30',
  },
  APPLICATION: {
    label: 'Applied',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30',
  },
};

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  let contact: (Contact & { dealContacts: { deal: { id: string; title: string; address: string | null; value: number | null; stage: { name: string; color: string } } }[] }) | null = null;
  try {
    const contactRows = await sql`
      SELECT * FROM "Contact" WHERE id = ${id}
    `;
    if (!contactRows[0]) {
      contact = null;
    } else {
      const c = contactRows[0] as Contact;
      const dealRows = await sql`
        SELECT d.*, ds.name AS "stageName", ds.color AS "stageColor"
        FROM "DealContact" dc
        JOIN "Deal" d ON d.id = dc."dealId"
        JOIN "DealStage" ds ON ds.id = d."stageId"
        WHERE dc."contactId" = ${id}
      `;
      contact = {
        ...c,
        dealContacts: (dealRows as Record<string, unknown>[]).map((row) => ({
          deal: {
            id: row.id as string,
            title: row.title as string,
            address: row.address as string | null,
            value: row.value as number | null,
            stage: {
              name: row.stageName as string,
              color: row.stageColor as string,
            },
          },
        })),
      };
    }
  } catch (err) {
    console.error('[contact-detail] DB query failed', { slug, id, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load this contact. This is usually temporary.</p>
          <a href={`/s/${slug}/contacts`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Back to clients</a>
        </div>
      </div>
    );
  }

  if (!contact) notFound();

  const meta = TYPE_META[contact.type];

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="max-w-4xl space-y-5">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
          <Link href={`/s/${slug}/contacts`}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/s/${slug}/contacts`} className="hover:text-foreground transition-colors">
            Clients
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{contact.name}</span>
        </div>
      </div>

      {/* Profile header card */}
      <div className="rounded-2xl border border-border bg-card px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary flex-shrink-0">
            {getInitials(contact.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{contact.name}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-1 border ${meta.className}`}
              >
                {meta.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Added {new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Quick contact row */}
        {(contact.email || contact.phone) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-3">
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-foreground"
              >
                <Phone size={14} className="text-muted-foreground" />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-foreground"
              >
                <Mail size={14} className="text-muted-foreground" />
                {contact.email}
              </a>
            )}
          </div>
        )}
      </div>

      {/* Lead score */}
      {contact.scoringStatus === 'scored' && contact.leadScore != null && (
        <div className="rounded-2xl border border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Lead score</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums">{Math.round(contact.leadScore)}</span>
                <span className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-1 uppercase ${
                  contact.scoreLabel === 'hot'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                    : contact.scoreLabel === 'warm'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400'
                }`}>
                  {contact.scoreLabel}
                </span>
              </div>
            </div>
          </div>
          {contact.scoreSummary && (
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{contact.scoreSummary}</p>
          )}
        </div>
      )}

      {/* Application details */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Application details</h2>
        </div>
        <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {contact.budget != null && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Monthly budget</p>
              <p className="text-sm font-semibold text-foreground">
                {formatCurrency(contact.budget)}<span className="text-muted-foreground font-normal">/mo</span>
              </p>
            </div>
          )}
          {contact.address && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current address</p>
              <p className="text-sm text-foreground">{contact.address}</p>
            </div>
          )}
          {contact.preferences && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Preferred areas</p>
              <p className="text-sm text-foreground">{contact.preferences}</p>
            </div>
          )}
          {contact.properties.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground mb-2">Properties of interest</p>
              <div className="flex flex-wrap gap-1.5">
                {contact.properties.map((property) => (
                  <Badge key={property} variant="secondary" className="text-xs font-medium">
                    {property}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {contact.notes && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" /> Notes
            </h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {contact.notes}
            </p>
          </div>
        </div>
      )}

      {/* Tags */}
      {contact.tags.filter((t) => t !== 'application-link' && t !== 'new-lead').length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-4">
          <p className="text-xs text-muted-foreground mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags
              .filter((t) => t !== 'application-link' && t !== 'new-lead')
              .map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
          </div>
        </div>
      )}

      {/* Associated deals */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Associated deals</h2>
        </div>
        <div className="px-6 py-4">
          {contact.dealContacts.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No deals linked.</p>
              <Link
                href={`/s/${slug}/deals`}
                className="text-xs text-primary font-medium hover:underline mt-1 inline-block"
              >
                Go to deals →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {contact.dealContacts.map(({ deal }) => (
                <Link
                  key={deal.id}
                  href={`/s/${slug}/deals`}
                  className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{deal.title}</p>
                    {deal.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {deal.address}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    {deal.value != null && (
                      <p className="text-sm font-semibold tabular-nums">
                        ${deal.value.toLocaleString()}
                      </p>
                    )}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                      style={{ backgroundColor: deal.stage.color }}
                    >
                      {deal.stage.name}
                    </span>
                    <ExternalLink size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
