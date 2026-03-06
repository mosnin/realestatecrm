import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { ContactTable } from '@/components/contacts/contact-table';

export default async function ClientsPage({
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
        <h2 className="text-2xl font-bold tracking-tight">Clients</h2>
        <p className="text-muted-foreground">Manage your client pipeline from qualification to application</p>
      </div>
      <ContactTable subdomain={subdomain} />
    </div>
  );
}
