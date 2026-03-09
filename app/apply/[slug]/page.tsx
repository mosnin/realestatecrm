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
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSubdomain(slug);
  if (!space) notFound();

  let settings: { intakePageTitle?: string | null; intakePageIntro?: string | null } | null = null;
  try {
    settings = await db.spaceSetting.findUnique({
      where: { spaceId: space.id },
      select: { intakePageTitle: true, intakePageIntro: true }
    });
  } catch (error) {
    if (!isLegacySpaceSettingFieldError(error)) throw error;
    settings = null;
  }

  const pageTitle = settings?.intakePageTitle || `Apply with ${space.name}`;
  const pageIntro =
    settings?.intakePageIntro ||
    "Share your rental preferences and we'll follow up with next steps.";

  return (
    <ApplicationForm
      subdomain={slug}
      spaceName={space.name}
      pageTitle={pageTitle}
      pageIntro={pageIntro}
    />
  );
}
