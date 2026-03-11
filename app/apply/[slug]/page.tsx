import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSlug } from '@/lib/space';
import { ApplicationForm } from './application-form';

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const settings = await db.spaceSetting.findUnique({
    where: { spaceId: space.id },
    select: { intakePageTitle: true, intakePageIntro: true }
  });

  const pageTitle = settings?.intakePageTitle || `Apply with ${space.name}`;
  const pageIntro =
    settings?.intakePageIntro ||
    "Share your rental preferences and we'll follow up with next steps.";

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{pageTitle}</h1>
          <p className="text-muted-foreground mt-2">{pageIntro}</p>
        </div>
        <ApplicationForm slug={slug} />
      </div>
    </div>
  );
}
