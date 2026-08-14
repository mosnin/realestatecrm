import { redirect } from 'next/navigation';
import { getBrokerMemberContext } from '@/lib/permissions';
import { MessagesApp } from '@/components/messaging/messages-app';
import { TITLE_FONT } from '@/lib/typography';
import { SplitReveal } from '@/components/motion';
import {
  BROKER_ORIENTATION,
  BROKER_PAGE_WIDE,
  BROKER_PANEL,
} from '@/components/broker/premium';
import { cn } from '@/lib/utils';

/**
 * Broker-side team messaging. Accessible to every brokerage member (owners,
 * admins, and realtor members) — same MessagesApp as the realtor surface; the
 * /api/messages/* routes resolve the caller's brokerage either way.
 */
export default async function BrokerMessagesPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/setup');

  return (
    <div className={cn(BROKER_PAGE_WIDE, 'flex h-full max-w-7xl flex-col')} data-broker-premium-page="messages" data-broker-family="communications-inbox">
      <header className="mb-5 grid gap-5 border-b chippi-dashboard-divider pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" data-route-orientation="communications">
        <div className="space-y-3">
          <p className={BROKER_ORIENTATION}>{ctx.brokerage.name} · team communication</p>
          <h1 className="text-4xl tracking-[-0.04em] text-foreground sm:text-5xl" style={TITLE_FONT}>
          <SplitReveal as="span" text="Messages" />
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">One place for the decisions, handoffs, and follow-ups that keep the brokerage moving.</p>
        </div>
        <p className="max-w-xs text-sm text-muted-foreground lg:text-right">Choose a conversation on the left or start a new one inside the inbox.</p>
      </header>
      <div className={cn(BROKER_PANEL, 'h-[calc(100dvh-15rem)] min-h-[520px] flex-1 overflow-hidden p-0 sm:p-0')} data-primary-work-geometry="split-inbox">
        <MessagesApp />
      </div>
    </div>
  );
}
