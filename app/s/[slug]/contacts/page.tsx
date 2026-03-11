import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { ContactTable } from '@/components/contacts/contact-table';

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your renter pipeline from qualification to application
        </p>
      </div>
      <ContactTable slug={slug} />
    </div>
  );
}
