import { redirect } from 'next/navigation';
import { getBrokerMemberContext } from '@/lib/permissions';
import { MessagesApp } from '@/components/messaging/messages-app';
import { H1, TITLE_FONT } from '@/lib/typography';

/**
 * Broker-side team messaging. Accessible to every brokerage member (owners,
 * admins, and realtor members) — same MessagesApp as the realtor surface; the
 * /api/messages/* routes resolve the caller's brokerage either way.
 */
export default async function BrokerMessagesPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/setup');

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
      <header className="mb-3 space-y-0.5">
        <p className="text-sm text-muted-foreground">{ctx.brokerage.name}.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Messages
        </h1>
      </header>
      <div className="h-[calc(100dvh-13rem)] min-h-[480px] flex-1">
        <MessagesApp />
      </div>
    </div>
  );
}
