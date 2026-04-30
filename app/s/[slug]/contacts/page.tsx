import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { ContactTable } from '@/components/contacts/contact-table';

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Header lives inside ContactTable so the "Add a person" button shares state
  // with the modal. One client component, one source of truth for the surface.
  return <ContactTable slug={slug} />;
}
