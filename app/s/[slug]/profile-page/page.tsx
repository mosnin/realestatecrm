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
import {
  SupportingActionLink,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

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
    <SupportingPage family="control" width="wide">
      <SupportingOrientation
        family="control"
        eyebrow="Profile / Public hub"
        title={<SplitReveal as="span" text="One public page for every way to work with you" />}
        summary="Bring your application, tours, featured listings, videos, and trusted links into one client-facing destination."
        nextAction="Lead with the one action you most want a new visitor to take, then remove anything that competes with it."
        action={<SupportingActionLink href={`/p/${slug}`}>View public page</SupportingActionLink>}
      />
      <SupportingWorkArea>
      <Reveal className="mx-auto max-w-5xl">
        <ProfileEditor slug={slug} />
      </Reveal>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
