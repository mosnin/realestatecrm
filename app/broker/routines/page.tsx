import { redirect } from 'next/navigation';
import { getBrokerContext } from '@/lib/permissions';
import { RoutinesManager } from '@/components/routines/routines-manager';
import { SplitReveal } from '@/components/motion';
import { BROKER_PAGE_READING } from '@/components/broker/premium';

// Server component: broker-admin only. Renders the shared RoutinesManager
// pointed at the brokerage-scoped API. Use getBrokerContext (not requireBroker)
// so non-brokers get a clean redirect instead of a 500 — same pattern as
// app/broker/activity/page.tsx.
export default async function BrokerRoutinesPage() {
  const ctx = await getBrokerContext();
  if (!ctx) redirect('/');

  return (
    <div className={`${BROKER_PAGE_READING} max-w-4xl`} data-broker-premium-page="routines">
      <header className="space-y-1.5">
        <p className="text-sm text-muted-foreground">Routines.</p>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          <SplitReveal as="span" text="Standing instructions for Chippi" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Review team performance and flag deals on a schedule. Team-wide messages
          and changes to members or routing require you in Chippi.
        </p>
      </header>
      <RoutinesManager apiBase="/api/broker/routines" />
    </div>
  );
}
