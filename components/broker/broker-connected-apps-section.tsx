'use client';

import {
  ConnectedAppsSection,
  type CallbackResult,
} from '@/components/settings/connected-apps-section';

/**
 * Brokerage route adapter for the connected-apps client panel.
 *
 * Route builders are intentionally created inside this Client Component.
 * Server Components can only pass serializable props across the RSC boundary.
 */
export function BrokerConnectedAppsSection({
  callbackResult,
}: {
  callbackResult?: CallbackResult | null;
}) {
  return (
    <ConnectedAppsSection
      callbackResult={callbackResult}
      endpoints={{
        list: '/api/broker/integrations',
        connect: (toolkit) => `/api/broker/integrations/connect/${toolkit}`,
        item: (id) => `/api/broker/integrations/${id}`,
        // No health endpoint at the brokerage level yet — the panel falls
        // back to the static status pill.
      }}
    />
  );
}
