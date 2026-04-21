import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ContactTable } from '@/components/contacts/contact-table';
import { PeopleTabs } from '@/components/people/people-tabs';

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { count: newCount } = await supabase
    .from('Contact')
    .select('*', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .is('brokerageId', null)
    .contains('tags', ['new-lead']);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">People</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Everyone in your pipeline — from first inquiry to closed deal.
        </p>
      </div>
      <PeopleTabs slug={slug} newCount={newCount ?? 0} />
      <ContactTable slug={slug} />
    </div>
  );
}
