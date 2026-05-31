import { getBrokerMemberContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import AnnouncementsClient from './announcements-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Announcements — Teams' };

export default async function AnnouncementsPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  return (
    <div className="space-y-6 pb-56 md:pb-24">
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Announcements.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          What the team should know
        </h1>
        <p className={cn(BODY_MUTED)}>
          Post once. Everyone hears it.
        </p>
      </header>

      <AnnouncementsClient />
    </div>
  );
}
