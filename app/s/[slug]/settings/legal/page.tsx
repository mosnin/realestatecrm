import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { LegalSettingsForm } from './legal-settings-form';
import {
  H2,
  BODY_MUTED,
  PRIMARY_PILL,
  SECTION_RHYTHM,
  READING_MAX,
} from '@/lib/typography';

export default async function LegalSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let settings: { privacyPolicyUrl: string | null; consentCheckboxLabel: string | null } | null = null;
  try {
    const { data, error } = await supabase
      .from('SpaceSetting')
      .select('privacyPolicyUrl, consentCheckboxLabel')
      .eq('spaceId', space.id)
      .maybeSingle();
    if (error) throw error;
    settings = data ?? null;
  } catch (err) {
    console.error('[settings/legal] DB query failed', err);
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center space-y-3 p-8">
          <h2 className={H2}>Something went wrong</h2>
          <p className={BODY_MUTED}>
            We couldn&apos;t load your data. This is usually temporary.
          </p>
          <a href={`/s/${slug}/settings/legal`} className={PRIMARY_PILL}>
            Try again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
      <h2 className={H2}>Legal</h2>
      <LegalSettingsForm
        slug={space.slug}
        privacyPolicyUrl={settings?.privacyPolicyUrl ?? ''}
        consentCheckboxLabel={settings?.consentCheckboxLabel ?? ''}
      />
    </div>
  );
}
