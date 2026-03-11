import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { db } from '@/lib/db';
import { SettingsForm } from './settings-form';

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

  const settings = await db.spaceSetting.findUnique({
    where: { spaceId: space.id }
  });

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your profile, connections, AI, and billing preferences</p>
      </div>
      <SettingsForm space={space} settings={settings} />
    </div>
  );
}
