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

  // People is people. The contact table owns its own header, filters, and
  // rows. Pipeline metrics belong on analytics, not stacked on top of the
  // contact list, so nothing sits above the table here.
  return <ContactTable slug={slug} />;
}
