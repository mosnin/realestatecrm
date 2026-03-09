import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { ApplicationForm } from './application-form';

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Apply with {space.name}</h1>
          <p className="text-muted-foreground mt-2">
            Share your rental preferences and we&apos;ll follow up with next steps.
          </p>
        </div>
        <ApplicationForm subdomain={subdomain} />
      </div>
    </div>
  );
}
