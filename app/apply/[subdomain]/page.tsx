import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSubdomain } from '@/lib/space';
import { ApplicationForm } from './application-form';

function isLegacySpaceSettingFieldError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return [
    'Unknown argument `intakePageTitle`',
    'Unknown argument `intakePageIntro`',
    'Unknown field `intakePageTitle`',
    'Unknown field `intakePageIntro`',
    'does not exist in the current database'
  ].some((snippet) => error.message.includes(snippet));
}

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  let settings: { intakePageTitle?: string | null; intakePageIntro?: string | null } | null = null;
  try {
    settings = await db.spaceSetting.findUnique({
      where: { spaceId: space.id },
      select: { intakePageTitle: true, intakePageIntro: true }
    });
  } catch (error) {
    if (!isLegacySpaceSettingFieldError(error)) throw error;
    // Legacy Prisma/schema shape: fall back to default apply-page copy.
    settings = null;
  }

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
        <ApplicationForm subdomain={subdomain} />
      </div>
    </div>
  );
}
