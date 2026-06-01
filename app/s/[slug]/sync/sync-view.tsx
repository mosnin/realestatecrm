'use client';

/**
 * Smart sync view — the realtor's outside CRM, mirrored in here.
 *
 * One idea: connect your CRM once and its contacts live here.
 *
 * Three honest states:
 *   1. Not connected → calm connect prompt showing available CRMs.
 *   2. Connected + records → staggered list of contacts from the live CRM.
 *   3. Connected + empty → honest empty state (the CRM returned nothing).
 *
 * Live toolkits: hubspot, salesforce, pipedrive, zoho (all have Composio connectors).
 * Coming-soon toolkits: follow_up_boss, compass, boomtown, kvcore, real_geeks
 *   (no Composio toolkit exists yet — rendered as disabled "Coming soon" pills).
 *
 * Data contract: GET /api/sync?slug=<slug>
 *   { connected: boolean, source: string | null, records: SyncRecord[] }
 */

import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Plug, RefreshCw, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/lib/motion';
import {
  H1,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  CAPTION,
  META,
  SECTION_LABEL,
} from '@/lib/typography';
import type { SyncRecord, SyncResponse } from '@/app/api/sync/route';

/* ── CRM catalog for the connect panel ─────────────────────────────── */

interface CrmEntry {
  toolkit: string;
  name: string;
  blurb: string;
  comingSoon?: boolean;
}

/** CRM + real-estate entries surfaced on this page, in display order.
 *  Follow Up Boss leads the real-estate group. General CRMs follow.
 *  Coming-soon entries render as disabled pills — no fake connect path. */
const CRM_ENTRIES: CrmEntry[] = [
  // Real-estate CRMs — Follow Up Boss first-class
  { toolkit: 'follow_up_boss', name: 'Follow Up Boss', blurb: 'Sync your Follow Up Boss pipeline.', comingSoon: true },
  { toolkit: 'compass', name: 'Compass', blurb: 'Mirror your Compass pipeline.', comingSoon: true },
  { toolkit: 'boomtown', name: 'BoomTown', blurb: 'Pull BoomTown leads here.', comingSoon: true },
  { toolkit: 'kvcore', name: 'kvCORE', blurb: 'Pull kvCORE leads and tasks.', comingSoon: true },
  { toolkit: 'real_geeks', name: 'Real Geeks', blurb: 'Pull Real Geeks leads.', comingSoon: true },
  // General CRMs — live Composio connectors
  { toolkit: 'hubspot', name: 'HubSpot', blurb: 'Sync deals and contacts from HubSpot.' },
  { toolkit: 'salesforce', name: 'Salesforce', blurb: 'Mirror your Salesforce contacts.' },
  { toolkit: 'pipedrive', name: 'Pipedrive', blurb: 'Bring your Pipedrive contacts here.' },
  { toolkit: 'zoho', name: 'Zoho CRM', blurb: 'Two-way sync with Zoho.' },
];

const SOURCE_LABEL: Record<string, string> = {
  hubspot: 'HubSpot',
  salesforce: 'Salesforce',
  pipedrive: 'Pipedrive',
  zoho: 'Zoho CRM',
  follow_up_boss: 'Follow Up Boss',
};

function sourceLabel(source: string | null): string {
  if (!source) return 'your CRM';
  return SOURCE_LABEL[source] ?? source;
}

/* ── Props ──────────────────────────────────────────────────────────── */

interface SyncViewProps {
  slug: string;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function SyncView({ slug }: SyncViewProps) {
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reduced = useReducedMotion();

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/sync?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error(`Fetch failed (${res.status}).`);
      const json = (await res.json()) as SyncResponse;
      setData(json);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not reach your CRM.',
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords, refreshKey]);

  // Status sentence under the h1 — honest about what's connected.
  function statusSentence(): string {
    if (loading) return 'Checking your CRM connections.';
    if (errorMessage) return 'Could not load your contacts. Try again.';
    if (!data) return 'Connect a CRM to see your contacts here.';
    if (!data.connected) return 'Connect a CRM to bring your contacts in.';
    if (data.records.length === 0) return `Connected to ${sourceLabel(data.source)}. Nothing to show yet.`;
    return `${data.records.length} contact${data.records.length === 1 ? '' : 's'} from ${sourceLabel(data.source)}.`;
  }

  return (
    <div className="w-full mx-auto max-w-5xl pb-12 pt-10 sm:pt-14 space-y-8">
      {/* ── Page header ── */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Smart sync.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Your CRM, mirrored here.
        </h1>
        <p className={BODY_MUTED}>{statusSentence()}</p>
      </header>

      {/* ── Loading state ── */}
      {loading && (
        <p className={BODY_MUTED}>One moment — pulling your contacts.</p>
      )}

      {/* ── Error state ── */}
      {!loading && errorMessage && (
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className={BODY}>I couldn&apos;t reach your CRM just now.</p>
            <p className={BODY_MUTED}>{errorMessage}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className={cn(BODY_MUTED, 'text-foreground/70 hover:text-foreground transition-colors text-sm mt-1')}
            >
              Try again.
            </button>
          </CardContent>
        </Card>
      )}

      {/* ── Not connected → calm connect prompt ── */}
      {!loading && !errorMessage && data && !data.connected && (
        <ConnectPanel slug={slug} />
      )}

      {/* ── Connected + records ── */}
      {!loading && !errorMessage && data && data.connected && data.records.length > 0 && (
        <RecordsList
          records={data.records}
          source={data.source}
          slug={slug}
          reduced={!!reduced}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {/* ── Connected + empty ── */}
      {!loading && !errorMessage && data && data.connected && data.records.length === 0 && (
        <ConnectedEmptyState source={data.source} slug={slug} onRefresh={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}

/* ── Connect panel (not connected) ──────────────────────────────────── */

function ConnectPanel({ slug }: { slug: string }) {
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  async function handleConnect(toolkit: string) {
    setBusyToolkit(toolkit);
    setConnectError(null);
    try {
      const res = await fetch(`/api/integrations/connect/${toolkit}`, { method: 'POST' });
      const json = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !json.redirectUrl) {
        setConnectError(json.error ?? `Could not start ${toolkit} connect.`);
        setBusyToolkit(null);
        return;
      }
      window.location.assign(json.redirectUrl);
    } catch {
      setConnectError('Could not reach the integrations service.');
      setBusyToolkit(null);
    }
  }

  const realEstate = CRM_ENTRIES.filter((e) => e.comingSoon);
  const live = CRM_ENTRIES.filter((e) => !e.comingSoon);

  return (
    <div className="space-y-8">
      {connectError && (
        <p className="text-sm text-destructive">{connectError}</p>
      )}

      {/* Real-estate CRMs — coming soon, shown first */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>Real estate CRMs</p>
        <ul className="divide-y divide-border/60">
          {realEstate.map((entry) => (
            <CrmConnectRow
              key={entry.toolkit}
              entry={entry}
              busy={busyToolkit === entry.toolkit}
              onConnect={() => handleConnect(entry.toolkit)}
            />
          ))}
        </ul>
      </section>

      {/* General CRMs — live */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>General CRMs</p>
        <ul className="divide-y divide-border/60">
          {live.map((entry) => (
            <CrmConnectRow
              key={entry.toolkit}
              entry={entry}
              busy={busyToolkit === entry.toolkit}
              onConnect={() => handleConnect(entry.toolkit)}
            />
          ))}
        </ul>
      </section>

      <p className={CAPTION}>
        Connect more apps in{' '}
        <a
          href={`/s/${slug}/settings/integrations`}
          className="text-foreground/70 hover:text-foreground underline-offset-2 hover:underline transition-colors"
        >
          Integrations settings
        </a>
        .
      </p>
    </div>
  );
}

function CrmConnectRow({
  entry,
  busy,
  onConnect,
}: {
  entry: CrmEntry;
  busy: boolean;
  onConnect: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0">
      {/* Letter-circle icon fallback — no brand marks we don't have SVGs for */}
      <span
        aria-hidden
        className="w-8 h-8 rounded-md bg-muted text-muted-foreground inline-flex items-center justify-center text-sm font-semibold flex-shrink-0"
      >
        {entry.name[0]}
      </span>
      <div className="flex-1 min-w-0">
        <p className={cn(BODY, entry.comingSoon ? 'text-muted-foreground' : 'text-foreground')}>
          {entry.name}
        </p>
        <p className={CAPTION}>{entry.blurb}</p>
      </div>
      {entry.comingSoon ? (
        <span
          aria-disabled="true"
          className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-muted text-muted-foreground flex-shrink-0"
        >
          Coming soon
        </span>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className="inline-flex items-center h-7 px-3 rounded-full text-xs font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors flex-shrink-0 disabled:opacity-50"
        >
          {busy ? (
            <RefreshCw size={11} className="animate-spin" />
          ) : (
            <>
              <Plug size={11} className="mr-1.5" />
              Connect
            </>
          )}
        </button>
      )}
    </li>
  );
}

/* ── Records list (connected + records) ─────────────────────────────── */

function RecordsList({
  records,
  source,
  slug,
  reduced,
  onRefresh,
}: {
  records: SyncRecord[];
  source: string | null;
  slug: string;
  reduced: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <p className={SECTION_LABEL}>{sourceLabel(source)}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="h-7 w-7 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
            aria-label="Refresh contacts"
            title="Refresh contacts"
          >
            <RefreshCw size={13} strokeWidth={1.75} />
          </button>
          <a
            href={`/s/${slug}/settings/integrations`}
            className={cn(
              'inline-flex items-center gap-1 h-7 px-3 rounded-full text-xs font-medium',
              'border border-border/70 text-muted-foreground hover:text-foreground transition-colors duration-150',
            )}
          >
            Manage
            <ArrowUpRight size={11} strokeWidth={1.75} />
          </a>
        </div>
      </div>

      {/* Staggered record list */}
      <motion.ul
        className="divide-y divide-border/60"
        variants={reduced ? undefined : STAGGER_CONTAINER}
        initial="initial"
        animate="enter"
      >
        {records.map((record) => (
          <RecordRow key={record.id} record={record} reduced={reduced} />
        ))}
      </motion.ul>
    </div>
  );
}

function RecordRow({ record, reduced }: { record: SyncRecord; reduced: boolean }) {
  const initials = record.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

  function formatDate(iso: string | null): string | null {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return null;
    }
  }

  const dateLabel = formatDate(record.lastActivityAt);

  return (
    <motion.li
      className="flex items-center gap-3 py-3 hover:bg-foreground/[0.04] -mx-3 px-3 rounded-sm transition-colors duration-150"
      variants={reduced ? undefined : STAGGER_ITEM}
    >
      {/* Avatar */}
      <span
        aria-hidden
        className="w-8 h-8 rounded-full bg-muted text-muted-foreground inline-flex items-center justify-center text-xs font-semibold flex-shrink-0"
      >
        {initials || <User size={13} />}
      </span>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={cn(BODY, 'font-medium truncate')}>{record.name}</p>
        <p className={cn(CAPTION, 'truncate')}>
          {record.email
            ? record.email
            : record.phone
              ? record.phone
              : <span className="opacity-50">no contact details</span>}
          {record.stage && (
            <span className="ml-2 inline-flex items-center text-[10px] font-medium uppercase tracking-wider rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">
              {record.stage}
            </span>
          )}
        </p>
      </div>

      {/* Meta */}
      {dateLabel && (
        <span className={cn(META, 'shrink-0 tabular-nums')}>{dateLabel}</span>
      )}
    </motion.li>
  );
}

/* ── Connected + empty state ─────────────────────────────────────────── */

function ConnectedEmptyState({
  source,
  slug,
  onRefresh,
}: {
  source: string | null;
  slug: string;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <p className={SECTION_LABEL}>{sourceLabel(source)}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="h-7 w-7 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
            aria-label="Refresh contacts"
            title="Refresh contacts"
          >
            <RefreshCw size={13} strokeWidth={1.75} />
          </button>
          <a
            href={`/s/${slug}/settings/integrations`}
            className={cn(
              'inline-flex items-center gap-1 h-7 px-3 rounded-full text-xs font-medium',
              'border border-border/70 text-muted-foreground hover:text-foreground transition-colors duration-150',
            )}
          >
            Manage
            <ArrowUpRight size={11} strokeWidth={1.75} />
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
        <p className={BODY}>Nothing in your {sourceLabel(source)} yet.</p>
        <p className={cn(CAPTION, 'mt-1')}>
          Contacts and leads will appear here once they&apos;re in your CRM.
        </p>
      </div>
    </div>
  );
}
