import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { ContactTable } from '@/components/contacts/contact-table';

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Middleware only requires login; ownership of /s/[slug] is enforced here.
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) notFound();

  // ContactTable owns its own header, filters, and rows — one client
  // component, one source of truth for the surface. The New/All tab strip
  // that used to sit above is gone: the stage filter already cuts state,
  // and stacking two state-cuts on top of each other was the chief source
  // of the "messy top" the realtor flagged.
  return <ContactTable slug={slug} />;
}
