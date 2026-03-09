import { notFound } from 'next/navigation';
import { getSpaceFromSubdomain } from '@/lib/space';
import { ApplicationWizard } from './application-wizard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return { title: 'Rental Application' };
  return {
    title: `Rental Application — ${space.name}`,
    description: `Apply for a rental property listed by ${space.name}.`,
  };
}

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);

  if (!space) notFound();

  console.log('[analytics]', 'intake_link_viewed', { subdomain });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {space.emoji}
          </span>
          <div>
            <p className="font-semibold text-sm leading-tight">{space.intakeDisplayTitle ?? space.name}</p>
            <p className="text-xs text-muted-foreground">{space.intakeIntroLine ?? 'Rental Application'}</p>
          </div>
        </div>
      </header>

      {/* Wizard */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <ApplicationWizard
          spaceId={space.id}
          subdomain={subdomain}
          spaceName={space.name}
        />
      </main>
    </div>
  );
}
