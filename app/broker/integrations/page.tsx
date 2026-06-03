import { redirect } from 'next/navigation';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { supabase } from '@/lib/supabase';
import { ConnectedAppsSection } from '@/components/settings/connected-apps-section';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  SECTION_RHYTHM,
  READING_MAX,
} from '@/lib/typography';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Integrations — Teams' };

/**
 * /broker/integrations — the brokerage's connected third-party accounts.
 *
 * Scope: IntegrationConnection rows belong to the authenticated user
 * (broker_owner or broker_admin) via /api/integrations, which calls
 * `getSpaceForUser(userId)` → the caller's own Space. For a broker_owner
 * that is their personal workspace; for a broker_admin it is their own
 * realtor workspace. Either way the connections are theirs — they run
 * through their own OAuth grants, not the owner's.
 *
 * The ConnectedAppsSection client component already talks to
 * /api/integrations, /api/integrations/health, and the connect/disconnect
 * routes — all of which are scoped to the calling user. No props need to
 * thread the space id through; the API handles it.
 */
export default async function BrokerIntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    integration?: string;
    reason?: string;
    toolkit?: string;
  }>;
}) {
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;
  const sp = await searchParams;

  // Verify the broker owner has a workspace — if they're broker_only with no
  // personal Space the API will 403, so we surface a clean fallback rather
  // than letting the panel load into a perpetual not-configured state.
  const { data: ownerSpace } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerage.ownerId)
    .maybeSingle();

  const hasOwnerSpace = Boolean(ownerSpace?.id);

  const callbackResult =
    sp.integration === 'connected' || sp.integration === 'failed'
      ? {
          ok: sp.integration === 'connected',
          reason: sp.reason ?? null,
          toolkit: sp.toolkit ?? null,
        }
      : null;

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX} pb-56 md:pb-24`}>
      {/* Page header — serif H1 + status sentence */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Integrations.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Integrations
        </h1>
        <p className={BODY_MUTED}>
          Connect your brokerage&apos;s tools so Chippi can act across them.
        </p>
      </header>

      {/* No workspace → clean gate. No crash, no broken API calls. */}
      {!hasOwnerSpace ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">Integrations aren&apos;t available yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            The brokerage owner needs a workspace before apps can be connected.
          </p>
        </div>
      ) : (
        <ConnectedAppsSection callbackResult={callbackResult} />
      )}
    </div>
  );
}
