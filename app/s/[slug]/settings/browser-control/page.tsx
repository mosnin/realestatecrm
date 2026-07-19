import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { BrowserControlClient } from './browser-control-client';
import { H1, BODY_MUTED, TITLE_FONT, SECTION_RHYTHM, READING_MAX } from '@/lib/typography';

/**
 * Settings → Browser control — a standalone settings page (not folded into
 * the main /settings tab strip; see the client component's file header for
 * why). Pairs a Chippi browser extension to this realtor's account so the
 * chat agent can drive their own logged-in browser, shows linked devices,
 * and explains the guardrails (closed action set, kill switch, visible
 * cursor) in plain language.
 *
 * Server component: resolves auth + space, then hands off to the client
 * island for the actual pairing flow (status polling, code generation,
 * revoke) — same server/client split as every other settings surface.
 */
export default async function BrowserControlSettingsPage({
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
        <p className={BODY_MUTED}>
          <Link href={`/s/${space.slug}/settings`} className="hover:text-foreground transition-colors duration-150">
            Settings
          </Link>{' '}
          / Browser control
        </p>
        <h1 className={H1} style={TITLE_FONT}>
          Browser control
        </h1>
        <p className={BODY_MUTED}>
          Pair the Chippi browser extension so the chat agent can drive your
          own logged-in browser — MLS lookups, filling out forms on sites
          Chippi can&apos;t reach any other way — while you watch, with a kill
          switch always within reach.
        </p>
      </header>

      <BrowserControlClient />
    </div>
  );
}
