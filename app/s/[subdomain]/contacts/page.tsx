import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { ContactTable } from '@/components/contacts/contact-table';

export default async function ContactsPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Contacts</h2>
        <p className="text-muted-foreground">Manage your buyers, sellers, and agents</p>
      </div>
      <ContactTable subdomain={subdomain} />
    </div>
  );
}
