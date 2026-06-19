import { redirect } from 'next/navigation';
import { isPlatformAdmin } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { SpaceListClient } from './space-list-client';
import { AdminPageHeader } from '@/app/admin/components/admin-page-header';

export const metadata = { title: 'Spaces — Admin — Chippi' };

export default async function AdminSpacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const initialQuery = (await searchParams).q?.trim() || '';

  const { data: spaces, error } = await supabase
    .from('Space')
    .select(
      'id, slug, name, emoji, ownerId, brokerageId, createdAt, stripeCustomerId, stripeSubscriptionId, stripeSubscriptionStatus, stripePeriodEnd'
    )
    .order('createdAt', { ascending: false })
    .limit(200);

  if (error) throw error;

  const ownerIds = [
    ...new Set((spaces ?? []).map((s) => s.ownerId).filter(Boolean)),
  ];

  const { data: owners, error: ownerError } =
    ownerIds.length > 0
      ? await supabase
          .from('User')
          .select('id, name, email')
          .in('id', ownerIds)
      : { data: [], error: null };

  if (ownerError) throw ownerError;

  const ownerMap: Record<string, { id: string; name: string | null; email: string }> = {};
  for (const o of owners ?? []) {
    ownerMap[o.id] = { id: o.id, name: o.name, email: o.email };
  }

  const totalCount = spaces?.length ?? 0;

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <AdminPageHeader
        eyebrow="Management."
        title="Spaces"
        subtitle={`${totalCount} total spaces.`}
      />

      <SpaceListClient
        spaces={(spaces ?? []).map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          emoji: s.emoji,
          ownerId: s.ownerId,
          brokerageId: s.brokerageId,
          createdAt: s.createdAt,
          stripeSubscriptionStatus: s.stripeSubscriptionStatus,
          stripePeriodEnd: s.stripePeriodEnd,
        }))}
        ownerMap={ownerMap}
        totalCount={totalCount}
        initialQuery={initialQuery}
      />
    </div>
  );
}
