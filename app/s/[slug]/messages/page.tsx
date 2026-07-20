import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { MessagesApp } from '@/components/messaging/messages-app';
import { H1, TITLE_FONT } from '@/lib/typography';
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
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
      <header className="mb-3 space-y-0.5">
        <p className="text-sm text-muted-foreground">Team.</p>
        <h1 className={H1} style={TITLE_FONT}>
          <SplitReveal as="span" text="Messages" />
        </h1>
      </header>
      <div className="h-[calc(100dvh-13rem)] min-h-[480px] flex-1">
        {ctx ? (
          <MessagesApp />
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
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
