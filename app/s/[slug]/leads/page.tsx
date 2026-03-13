import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug } from '@/lib/space';
import { Phone } from 'lucide-react';
import Link from 'next/link';
import type { Contact } from '@/lib/types';
import { LeadsView } from '@/components/leads/leads-view';

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
    const { data, error } = await supabase
      .from('Contact')
      .select('*')
      .eq('spaceId', space.id)
      .contains('tags', ['application-link'])
      .order('createdAt', { ascending: false })
      .limit(100);
    if (error) throw error;
    leads = (data ?? []) as Contact[];
  } catch (err) {
    console.error('[leads] DB query failed', { slug, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your leads. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}/leads`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
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
          await supabase
            .from('Contact')
            .update({ tags: newTags, updatedAt: new Date().toISOString() })
            .eq('id', lead.id);
        }),
      );
    } catch {
      // non-blocking
    }
  }

  const newCount = unreadLeads.length;
  const newLeadIds = new Set(unreadLeads.map((l) => l.id));

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
        <LeadsView leads={leads} slug={slug} newLeadIds={newLeadIds} />
      )}
    </div>
  );
}
