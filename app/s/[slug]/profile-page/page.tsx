/**
 * Editor for the realtor's public "link in bio" page.
 *
 * Server shell only — resolves the space, then hands off to the client
 * <ProfileEditor/>, which reads and writes config through
 * /api/profile-page. The public page itself lives at /p/[slug].
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { ProfileEditor } from '@/components/profile-page/profile-editor';
import { H1, BODY_MUTED, SECTION_RHYTHM, READING_MAX } from '@/lib/typography';
import { Reveal, SplitReveal } from '@/components/motion';
import { cn } from '@/lib/utils';

export default async function ProfilePageEditor({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX} pb-12`}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Profile.</p>
        <SplitReveal
          as="h1"
          text="Your public page"
          className={cn(H1, '[font-family:var(--font-title)]')}
        />
        <p className={BODY_MUTED}>
          The one link you share — application, tours, listings, and more.
        </p>
      </header>

      <Reveal>
        <ProfileEditor slug={slug} />
      </Reveal>
    </div>
  );
}
