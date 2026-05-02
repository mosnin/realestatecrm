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
 */

import { useEffect, useMemo, useState } from 'react';
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

const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  communication: 'Communication',
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
  'communication',
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
              {apps.map((app) => (
                <Row
                  key={app.toolkit}
                  app={app}
                  connection={byToolkit.get(app.toolkit) ?? null}
                  busy={busyToolkit === app.toolkit || busyToolkit === byToolkit.get(app.toolkit)?.id}
                  onConnect={() => handleConnect(app.toolkit)}
                  onDisconnect={() => {
                    const c = byToolkit.get(app.toolkit);
                    if (c) void handleDisconnect(c.id);
                  }}
                />
              ))}
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
  onConnect,
  onDisconnect,
}: {
  app: IntegrationApp;
  connection: ConnectionRow | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const status = connection?.status ?? null;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Dot status={status} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{app.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {connection?.label ? connection.label : app.blurb}
        </p>
      </div>
      <Action
        status={status}
        busy={busy}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />
    </div>
  );
}

function Dot({ status }: { status: ConnectionRow['status'] | null }) {
  const color =
    status === 'active'
      ? 'bg-emerald-500'
      : status === 'expired'
        ? 'bg-amber-500'
        : status === 'failed'
          ? 'bg-rose-500'
          : 'bg-border';
  return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', color)} aria-hidden />;
}

function Action({
  status,
  busy,
  onConnect,
  onDisconnect,
}: {
  status: ConnectionRow['status'] | null;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (busy) {
    return <Loader2 size={14} className="animate-spin text-muted-foreground" />;
  }
  if (status === 'active') {
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
  if (status === 'expired' || status === 'failed') {
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
