'use client';

/**
 * Connected apps panel for /settings.
 *
 * Lists every integration in the catalog with one of three states:
 *   - active   → green dot + "Disconnect" link
 *   - expired  → amber dot + "Reconnect" link
 *   - none     → "Connect" pill
 *
 * The realtor sees one row per app. Connect → OAuth at the provider →
 * Composio sends them back to /integrations/callback → row appears
 * connected. Disconnect → one tap, no confirm. Reconnect = disconnect
 * + connect, but the realtor sees one tap.
 *
 * Categories are guidance, not a filter dropdown — they help the
 * realtor scan, not configure.
 *
 * Health badges: after the connection list loads, we fire a separate
 * non-blocking fetch to /api/integrations/health so each connected row
 * shows a live status badge (healthy / expired / error / disconnected).
 * The badge refreshes on window focus — stale auth shows up the moment
 * the realtor comes back to the tab, not just when they next open a chat.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAPTION, BODY_MUTED } from '@/lib/typography';
import {
  INTEGRATIONS,
  integrationsByCategory,
  type IntegrationApp,
  type IntegrationCategory,
} from '@/lib/integrations/catalog';

interface ConnectionRow {
  id: string;
  toolkit: string;
  status: 'active' | 'expired' | 'failed';
  label: string | null;
  lastError: string | null;
}

// ── Health badge types ────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'expired' | 'error' | 'disconnected';

interface ConnectionHealth {
  toolkit: string;
  name: string;
  status: HealthStatus;
  lastCheckedAt: string;
  error?: string;
}

/**
 * IntegrationHealthBadge — client component that shows the live Composio
 * connection status for a single integration.
 *
 * Props are pushed down from ConnectedAppsSection which owns the fetch.
 * Loading state is a pulsing dot skeleton; the badge never blocks render.
 */
function IntegrationHealthBadge({
  health,
  loading,
}: {
  health: ConnectionHealth | null | undefined;
  loading: boolean;
}) {
  if (loading) {
    // Skeleton: animate-pulse dot only — don't show stale text.
    return (
      <span className="inline-flex items-center gap-1.5" aria-label="Checking status">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse" aria-hidden />
      </span>
    );
  }

  if (!health) return null;

  const { status, error } = health;

  const dotClass =
    status === 'healthy'
      ? 'bg-green-500'
      : status === 'expired'
        ? 'bg-yellow-500'
        : status === 'error'
          ? 'bg-red-500'
          : 'bg-muted-foreground/40'; // disconnected

  const label =
    status === 'healthy'
      ? 'Connected'
      : status === 'expired'
        ? 'Auth expired'
        : status === 'error'
          ? 'Connection error'
          : 'Not connected';

  const textClass =
    status === 'healthy'
      ? 'text-green-600 dark:text-green-400'
      : status === 'expired'
        ? 'text-yellow-600 dark:text-yellow-400'
        : status === 'error'
          ? 'text-red-600 dark:text-red-400'
          : 'text-muted-foreground';

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={error ?? label}
      aria-label={label}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} aria-hidden />
      <span className={cn('text-xs', textClass)}>{label}</span>
    </span>
  );
}

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  email: 'Email',
  messaging: 'Messaging',
  calendar: 'Calendar',
  docs: 'Documents',
  crm: 'CRM',
  'real-estate': 'Real estate',
  'docs-sign': 'Signatures',
  tasks: 'Tasks',
  forms: 'Forms',
  video: 'Video',
  storage: 'Storage',
};

const CATEGORY_ORDER: IntegrationCategory[] = [
  'email',
  'messaging',
  'calendar',
  'docs',
  'crm',
  'real-estate',
  'docs-sign',
  'tasks',
  'forms',
  'video',
  'storage',
];

export function ConnectedAppsSection() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Health state: null = not yet fetched, true = loading, false = loaded/failed.
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthByToolkit, setHealthByToolkit] = useState<Map<string, ConnectionHealth>>(
    new Map(),
  );

  useEffect(() => {
    void fetchConnections();
  }, []);

  async function fetchConnections() {
    try {
      const res = await fetch('/api/integrations');
      if (!res.ok) {
        setConfigured(false);
        return;
      }
      const data = (await res.json()) as {
        configured: boolean;
        connections: ConnectionRow[];
      };
      setConfigured(data.configured);
      setConnections(data.connections);
    } catch {
      setConfigured(false);
    }
  }

  // fetchHealth is intentionally non-blocking — it updates the health badges
  // after the connections list is already on screen.
  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch('/api/integrations/health');
      if (!res.ok) return;
      const data = (await res.json()) as { connections: ConnectionHealth[] };
      const map = new Map<string, ConnectionHealth>();
      for (const h of data.connections) {
        map.set(h.toolkit, h);
      }
      setHealthByToolkit(map);
    } catch {
      // Health fetch failure is silent — the dot just won't render.
    } finally {
      setHealthLoading(false);
    }
  }, []);

  // Fetch health on mount and whenever the window regains focus.
  // This catches stale auth that expires while the realtor is away.
  useEffect(() => {
    void fetchHealth();

    const onFocus = () => void fetchHealth();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchHealth]);

  async function handleConnect(toolkit: string) {
    setBusyToolkit(toolkit);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/connect/${toolkit}`, {
        method: 'POST',
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) {
        setError(data.error ?? `Could not start connect for ${toolkit}.`);
        setBusyToolkit(null);
        return;
      }
      // Hand off to the provider's OAuth screen. Composio sends them back
      // to /integrations/callback, which redirects to /settings#integrations
      // and we re-fetch on mount.
      window.location.assign(data.redirectUrl);
    } catch {
      setError(`Could not reach the integrations service.`);
      setBusyToolkit(null);
    }
  }

  async function handleDisconnect(connectionId: string) {
    setBusyToolkit(connectionId);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/${connectionId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError('Could not disconnect.');
        setBusyToolkit(null);
        return;
      }
      setConnections((prev) => prev.filter((c) => c.id !== connectionId));
    } catch {
      setError('Could not disconnect.');
    } finally {
      setBusyToolkit(null);
    }
  }

  const byToolkit = useMemo(() => {
    const map = new Map<string, ConnectionRow>();
    for (const c of connections) {
      const existing = map.get(c.toolkit);
      // Prefer 'active', then 'expired', then 'failed'.
      if (
        !existing ||
        rank(c.status) > rank(existing.status)
      ) {
        map.set(c.toolkit, c);
      }
    }
    return map;
  }, [connections]);

  const grouped = integrationsByCategory();

  if (configured === false) {
    return (
      <p className={BODY_MUTED}>
        App connections aren&apos;t configured for this workspace yet.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const apps = grouped[cat];
        if (!apps || apps.length === 0) return null;
        return (
          <div key={cat} className="space-y-3">
            <p className={CAPTION}>{CATEGORY_LABEL[cat]}</p>
            <div className="rounded-xl border border-border/70 bg-card divide-y divide-border/60">
              {apps.map((app) => {
                const connection = byToolkit.get(app.toolkit) ?? null;
                // Only show health badge when there is an active connection —
                // coming-soon and unconnected rows don't need one.
                const showHealth = Boolean(connection) && !app.comingSoon;
                return (
                  <Row
                    key={app.toolkit}
                    app={app}
                    connection={connection}
                    busy={busyToolkit === app.toolkit || busyToolkit === byToolkit.get(app.toolkit)?.id}
                    health={showHealth ? (healthByToolkit.get(app.toolkit) ?? null) : null}
                    healthLoading={showHealth && healthLoading}
                    onConnect={() => handleConnect(app.toolkit)}
                    onDisconnect={() => {
                      const c = byToolkit.get(app.toolkit);
                      if (c) void handleDisconnect(c.id);
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <p className={CAPTION}>
        Connections are scoped to this workspace. Disconnect anytime —
        Chippi stops using the app on the next message.
      </p>
    </div>
  );
}

function rank(status: ConnectionRow['status']): number {
  if (status === 'active') return 3;
  if (status === 'expired') return 2;
  return 1; // failed
}

function Row({
  app,
  connection,
  busy,
  health,
  healthLoading,
  onConnect,
  onDisconnect,
}: {
  app: IntegrationApp;
  connection: ConnectionRow | null;
  busy: boolean;
  health: ConnectionHealth | null;
  healthLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const status = connection?.status ?? null;
  const action = pickRowAction({ comingSoon: app.comingSoon, status, busy });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Dot status={status} comingSoon={app.comingSoon} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{app.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {connection?.label ? connection.label : app.blurb}
        </p>
      </div>
      {/* Health badge: only rendered for connected (non-coming-soon) rows. */}
      {(health !== null || healthLoading) && (
        <IntegrationHealthBadge health={health} loading={healthLoading} />
      )}
      <Action action={action} onConnect={onConnect} onDisconnect={onDisconnect} />
    </div>
  );
}

function Dot({
  status,
  comingSoon,
}: {
  status: ConnectionRow['status'] | null;
  comingSoon?: boolean;
}) {
  // Coming-soon rows have no real status — keep the dot empty so the
  // "Coming soon" pill carries the meaning. Showing a colored dot on an
  // unconnectable row would imply state that isn't there.
  const color = comingSoon
    ? 'bg-border'
    : status === 'active'
      ? 'bg-emerald-500'
      : status === 'expired'
        ? 'bg-amber-500'
        : status === 'failed'
          ? 'bg-rose-500'
          : 'bg-border';
  return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', color)} aria-hidden />;
}

/**
 * The action a row should render. Pure — pulled out so it's testable
 * without rendering. Three real states + a busy spinner + the
 * coming-soon pill for catalog placeholders that have no Composio
 * toolkit yet.
 */
export type RowAction =
  | { kind: 'busy' }
  | { kind: 'coming-soon' }
  | { kind: 'disconnect' }
  | { kind: 'reconnect' }
  | { kind: 'connect' };

export function pickRowAction(args: {
  comingSoon?: boolean;
  status: ConnectionRow['status'] | null;
  busy: boolean;
}): RowAction {
  // Coming-soon wins over everything (including busy) — these rows have
  // no connect path at all, so a spinner would be a lie.
  if (args.comingSoon) return { kind: 'coming-soon' };
  if (args.busy) return { kind: 'busy' };
  if (args.status === 'active') return { kind: 'disconnect' };
  if (args.status === 'expired' || args.status === 'failed') return { kind: 'reconnect' };
  return { kind: 'connect' };
}

function Action({
  action,
  onConnect,
  onDisconnect,
}: {
  action: RowAction;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (action.kind === 'busy') {
    return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
  }
  if (action.kind === 'coming-soon') {
    // Disabled, no click target. The realtor can read the row, can see
    // the app exists, and isn't lured into tapping a button that 501s.
    return (
      <span
        aria-disabled="true"
        className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-muted text-muted-foreground"
      >
        Coming soon
      </span>
    );
  }
  if (action.kind === 'disconnect') {
    return (
      <button
        type="button"
        onClick={onDisconnect}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Disconnect
      </button>
    );
  }
  if (action.kind === 'reconnect') {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="text-xs text-foreground hover:opacity-80 transition-opacity font-medium"
      >
        Reconnect
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onConnect}
      className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
    >
      Connect
    </button>
  );
}

// Re-export catalog so the section's consumer doesn't need to import twice.
export { INTEGRATIONS };
