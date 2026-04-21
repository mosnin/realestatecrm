import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { LegalSettingsForm } from './legal-settings-form';

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
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/settings`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Legal &amp; Compliance</h1>
        <p className="text-muted-foreground text-sm">Privacy policy and consent settings for your intake form</p>
      </div>
      <LegalSettingsForm
        slug={space.slug}
        privacyPolicyUrl={settings?.privacyPolicyUrl ?? ''}
        consentCheckboxLabel={settings?.consentCheckboxLabel ?? ''}
      />
    </div>
  );
}
