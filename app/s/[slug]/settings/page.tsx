import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { SettingsForm } from './settings-form';
import type { SpaceSetting } from '@/lib/types';

export default async function SettingsPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let settings: SpaceSetting | null = null;
  try {
    const { data, error } = await supabase.from('SpaceSetting').select('*').eq('spaceId', space.id).maybeSingle();
    if (error) throw error;
    settings = (data as SpaceSetting) ?? null;
  } catch {
    // fall back to null — form handles defaults
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your profile, connections, AI, and billing preferences</p>
      </div>
      <SettingsForm space={space} settings={settings} />
    </div>
  );
}
