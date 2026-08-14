import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { MessagesApp } from '@/components/messaging/messages-app';
import { TITLE_FONT, BODY_MUTED, SECTION_LABEL } from '@/lib/typography';
import { SplitReveal } from '@/components/motion';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Realtor-side team messaging. The MessagesApp is fully client-driven (it loads
 * channels/roster over /api/messages/*, which resolve the caller's brokerage),
 * so this page is a thin auth gate. Non-brokerage members get the app's own
 * upsell empty state rather than a 404 — the nav row is already gated to
 * brokerage members, so arriving here without a brokerage is an edge case.
 */
export default async function MessagesPage({ params }: PageProps) {
  await params; // slug is resolved by the layout; messaging is brokerage-scoped, not space-scoped.

  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/login/realtor');

  const ctx = await getBrokerMemberContext();

  return (
    <div className="chippi-dashboard-canvas mx-auto flex h-full w-full max-w-6xl flex-col" data-page-family="team-room">
      <header className="mb-6 grid gap-6 border-b border-border/60 pb-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
        <div className="space-y-2.5">
          <p className={SECTION_LABEL}>Team room</p>
          <h1 className="text-[2.75rem] leading-[.96] tracking-[-0.04em] sm:text-[4rem]" style={TITLE_FONT}>
            <SplitReveal as="span" text="Keep the handoff moving." />
          </h1>
        </div>
        <p className={`${BODY_MUTED} lg:text-right`}>
          Channels for shared context. Direct messages for the decision that needs one person.
        </p>
      </header>
      <div className="h-[calc(100dvh-13rem)] min-h-[480px] flex-1">
        {ctx ? (
          <MessagesApp />
        ) : (
          <div className="flex h-full items-center justify-center border-y border-border/60 p-8 text-center">
            <p className="max-w-sm text-sm text-muted-foreground">
              Messaging is for brokerage teams. Join or create a brokerage to message your team in
              real time — direct messages, channels, presence, and shared files.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
