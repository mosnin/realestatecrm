import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  DollarSign,
  Activity,
  Trophy,
  XCircle,
  PauseCircle,
  AlertTriangle,
  Users,
  FileText,
  PhoneCall,
  Mail,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import type { Contact, DealStage, DealActivity } from '@/lib/types';
import { DealDetailClient } from '@/components/deals/deal-detail-client';

const STATUS_META = {
  active: { label: 'Active', icon: Activity, className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  won: { label: 'Won', icon: Trophy, className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
  lost: { label: 'Lost', icon: XCircle, className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  on_hold: { label: 'On Hold', icon: PauseCircle, className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
};

const PRIORITY_META = {
  LOW: { label: 'Low', className: 'text-muted-foreground bg-muted' },
  MEDIUM: { label: 'Medium', className: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10' },
  HIGH: { label: 'High', className: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10' },
};

const ACTIVITY_META: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  note: { label: 'Note', icon: FileText, color: 'text-slate-500' },
  call: { label: 'Call', icon: PhoneCall, color: 'text-blue-500' },
  email: { label: 'Email', icon: Mail, color: 'text-violet-500' },
  meeting: { label: 'Meeting', icon: Users, color: 'text-teal-500' },
  follow_up: { label: 'Follow-up', icon: Clock, color: 'text-amber-500' },
  stage_change: { label: 'Stage changed', icon: Activity, color: 'text-indigo-500' },
  status_change: { label: 'Status changed', icon: CheckCircle2, color: 'text-green-500' },
};

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: dealRow, error: dealError } = await supabase
    .from('Deal')
    .select('*')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (dealError) throw dealError;
  if (!dealRow) notFound();

  const [stageResult, dcResult, activityResult] = await Promise.all([
    supabase.from('DealStage').select('*').eq('id', dealRow.stageId).maybeSingle(),
    supabase.from('DealContact').select('dealId, contactId, Contact(id, name, type, email, phone)').eq('dealId', id),
    supabase.from('DealActivity').select('*').eq('dealId', id).order('createdAt', { ascending: false }).limit(100),
  ]);

  const stage = stageResult.data as DealStage | null;
  const dealContacts = ((dcResult.data ?? []) as any[]).map((row) => ({
    dealId: row.dealId,
    contactId: row.contactId,
    contact: row.Contact
      ? { id: row.Contact.id, name: row.Contact.name, type: row.Contact.type, email: row.Contact.email ?? null, phone: row.Contact.phone ?? null }
      : null,
  }));
  const activities = (activityResult.data ?? []) as DealActivity[];

  const status = (dealRow.status ?? 'active') as keyof typeof STATUS_META;
  const priority = (dealRow.priority ?? 'MEDIUM') as keyof typeof PRIORITY_META;
  const statusMeta = STATUS_META[status] ?? STATUS_META.active;
  const priorityMeta = PRIORITY_META[priority] ?? PRIORITY_META.MEDIUM;
  const StatusIcon = statusMeta.icon;

  const followUpDate = dealRow.followUpAt ? new Date(dealRow.followUpAt) : null;
  const followUpOverdue = followUpDate && followUpDate < new Date();

  return (
    <div className="max-w-4xl space-y-5">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
          <Link href={`/s/${slug}/deals`}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/s/${slug}/deals`} className="hover:text-foreground transition-colors">
            Pipeline
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{dealRow.title}</span>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-border bg-card px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{dealRow.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${statusMeta.className}`}>
                <StatusIcon size={11} />
                {statusMeta.label}
              </span>
              {dealRow.value != null && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full px-2.5 py-1">
                  <DollarSign size={11} />
                  {dealRow.value.toLocaleString()}
                </span>
              )}
              <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${priorityMeta.className}`}>
                {priorityMeta.label} priority
              </span>
              {stage && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted rounded-full px-2.5 py-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  {stage.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-4 text-sm text-muted-foreground">
          {dealRow.address && (
            <span className="flex items-center gap-1.5">
              <MapPin size={13} className="flex-shrink-0" />
              {dealRow.address}
            </span>
          )}
          {dealRow.closeDate && (
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="flex-shrink-0" />
              Close: {new Date(dealRow.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
          {followUpDate && (
            <span className={`flex items-center gap-1.5 ${followUpOverdue ? 'text-destructive' : ''}`}>
              <AlertTriangle size={13} className="flex-shrink-0" />
              Follow-up: {followUpDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              {followUpOverdue && ' (overdue)'}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar size={13} className="flex-shrink-0" />
            Created {new Date(dealRow.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left: description + contacts */}
        <div className="md:col-span-1 space-y-5">
          {/* Linked contacts */}
          <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Users size={14} className="text-muted-foreground" />
              Contacts
            </h2>
            {dealContacts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contacts linked.</p>
            ) : (
              <div className="space-y-2">
                {dealContacts.map(({ contact }) =>
                  contact ? (
                    <Link
                      key={contact.id}
                      href={`/s/${slug}/contacts/${contact.id}`}
                      className="flex items-center gap-2.5 group"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">{contact.name}</p>
                        {contact.phone && <p className="text-xs text-muted-foreground truncate">{contact.phone}</p>}
                      </div>
                    </Link>
                  ) : null
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {dealRow.description && (
            <div className="rounded-2xl border border-border bg-card px-5 py-4">
              <h2 className="text-sm font-semibold mb-2">Notes</h2>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{dealRow.description}</p>
            </div>
          )}
        </div>

        {/* Right: activity log */}
        <div className="md:col-span-2">
          <DealDetailClient
            dealId={id}
            slug={slug}
            initialActivities={activities}
            activityMeta={ACTIVITY_META}
          />
        </div>
      </div>
    </div>
  );
}
