import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ContactTable } from '@/components/contacts/contact-table';
import { PeopleTabs } from '@/components/people/people-tabs';
import { PageTitle } from '@/components/ui/page-title';

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
    <div className="space-y-6">
      <PageTitle subtitle="Everyone in your pipeline — from first inquiry to closed deal.">
        People
      </PageTitle>
      <PeopleTabs slug={slug} newCount={newCount ?? 0} />
      <ContactTable slug={slug} />
    </div>
  );
}
