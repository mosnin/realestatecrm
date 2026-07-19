'use client';

/**
 * Browser control settings — pairing flow + linked-device list.
 *
 * Deliberately its OWN standalone page (`/settings/browser-control`) rather
 * than folded into the tabbed `/settings` page like most other sections:
 * this is a brand-new feature (not a legacy surface being consolidated),
 * the main `/settings/page.tsx` + its tab strip are outside this track's
 * ownership for this wave, and pairing has enough moving state (a live
 * countdown, a code that must stay visible while the realtor switches to
 * the extension popup) that it reads better as a dedicated screen than a
 * tab section competing for scroll position.
 *
 * Talks only to Track B's already-live routes:
 *   GET    /api/browser-control/status      — connection + linked devices
 *   POST   /api/browser-control/pair/code    — mint an 8-char pairing code
 *   DELETE /api/browser-control/link/[id]    — revoke (the kill switch)
 *
 * Honest UI: the empty state says "No browser connected yet," never a
 * fabricated "Connected" state, and a failed fetch says so rather than
 * silently showing stale data.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check, Loader2, MonitorSmartphone, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SurfaceCard, SurfaceCardHeader, StatusPill } from '@/components/ui/surface-card';
import { BODY, BODY_MUTED, CAPTION, H3, PRIMARY_PILL, GHOST_PILL, SECTION_LABEL } from '@/lib/typography';
import { PAIRING_CODE_TTL_SECONDS } from '@/lib/browser-control/protocol';
import { sourceLabel } from '@/components/chippi/browser-control-panel';

interface BrowserLinkRow {
  id: string;
  tokenPrefix: string;
  deviceLabel: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface StatusResponse {
  links: BrowserLinkRow[];
  connected: boolean;
  // `source` is optional + read defensively (see sourceLabel's default
  // branch) so this page never breaks against an older `/status` payload
  // that predates the headless track shipping it.
  session: { id: string; status: string; startedAt: string; hasFrame?: boolean; source?: string } | null;
}

/** A just-rotated token, shown exactly once (mirrors the pairing-code reveal —
 *  only its hash is ever persisted, so this is the only chance to see it). */
interface RotatedToken {
  linkId: string;
  token: string;
}

interface PairingCode {
  code: string;
  expiresAt: string;
}

const STATUS_POLL_MS = 5_000;

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatCountdown(secondsLeft: number): string {
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function BrowserControlClient() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [loading, setLoading] = useState(true);

  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotated, setRotated] = useState<RotatedToken | null>(null);
  const [rotateCopied, setRotateCopied] = useState(false);
  // Guard gracefully: if the rotate route isn't reachable for any reason
  // (404 / network), hide the affordance rather than offering a button that
  // always errors — honest UI over a permanently-broken control.
  const [rotateUnavailable, setRotateUnavailable] = useState(false);

  const wasConnectedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/browser-control/status');
      if (!res.ok) {
        setStatusError(true);
        return;
      }
      const data = (await res.json()) as StatusResponse;
      setStatusError(false);
      setStatus(data);
      // A pairing code that just got redeemed → clear it and celebrate once,
      // honestly (only when we actually transitioned from disconnected to
      // connected, not on every poll tick).
      if (data.connected && !wasConnectedRef.current && pairing) {
        setPairing(null);
        toast.success('Browser connected.');
      }
      wasConnectedRef.current = data.connected;
    } catch {
      setStatusError(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown tick for the live pairing code.
  useEffect(() => {
    if (!pairing) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.round((new Date(pairing.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setPairing(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pairing]);

  async function handleGenerateCode() {
    setIssuing(true);
    try {
      const res = await fetch('/api/browser-control/pair/code', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't generate a pairing code. Try again.");
        return;
      }
      setPairing({ code: data.code, expiresAt: data.expiresAt });
      setCopied(false);
    } catch {
      toast.error('Lost the connection. Try again.');
    } finally {
      setIssuing(false);
    }
  }

  async function handleCopy() {
    if (!pairing) return;
    await navigator.clipboard.writeText(pairing.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRotate(link: BrowserLinkRow) {
    const label = link.deviceLabel || 'this browser';
    if (
      !confirm(
        `Rotate the token for ${label}? The old token stops working immediately — you'll need to re-enter the new one in the extension.`,
      )
    ) {
      return;
    }
    setRotatingId(link.id);
    try {
      const res = await fetch(`/api/browser-control/link/${link.id}/rotate`, { method: 'POST' });
      if (res.status === 404) {
        // Route not (yet) live / link vanished mid-flight — degrade honestly
        // instead of a raw error toast every time the button is pressed.
        setRotateUnavailable(true);
        toast.error("Token rotation isn't available right now.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't rotate that token. Try again.");
        return;
      }
      if (typeof data.token !== 'string' || !data.token) {
        toast.error("Couldn't rotate that token. Try again.");
        return;
      }
      setRotated({ linkId: link.id, token: data.token });
      setRotateCopied(false);
      toast.success(`New token issued for ${label}.`);
      await fetchStatus();
    } catch {
      toast.error('Lost the connection. Try again.');
    } finally {
      setRotatingId(null);
    }
  }

  async function handleCopyRotated() {
    if (!rotated) return;
    await navigator.clipboard.writeText(rotated.token);
    setRotateCopied(true);
    setTimeout(() => setRotateCopied(false), 2000);
  }

  async function handleRevoke(link: BrowserLinkRow) {
    const label = link.deviceLabel || 'this browser';
    if (!confirm(`Disconnect ${label}? Chippi immediately loses the ability to drive it — this can't be undone from here; you'd have to pair again.`)) {
      return;
    }
    setRevokingId(link.id);
    try {
      const res = await fetch(`/api/browser-control/link/${link.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Couldn't disconnect that browser. Try again.");
        return;
      }
      toast.success(`${label} disconnected.`);
      await fetchStatus();
    } catch {
      toast.error('Lost the connection. Try again.');
    } finally {
      setRevokingId(null);
    }
  }

  const links = status?.links ?? [];
  const hasLinks = links.length > 0;

  return (
    <div className="space-y-8">
      {/* ── Connection status + linked devices ────────────────────────── */}
      <SurfaceCard>
        <SurfaceCardHeader
          title="Connected browsers"
          action={
            status?.session?.status === 'active' ? (
              <StatusPill className="bg-[#F25A00]/10 text-[#F25A00]">
                Active session · {sourceLabel(status.session.source).label}
                {status?.session?.hasFrame ? ' · live view' : ''}
              </StatusPill>
            ) : hasLinks ? (
              <StatusPill>Paired, idle</StatusPill>
            ) : null
          }
        />

        <div className="mt-4 space-y-3">
          {loading ? (
            <div className={cn(BODY_MUTED, 'flex items-center gap-2 py-6 justify-center')}>
              <Loader2 className="h-4 w-4 animate-spin" /> Checking connection…
            </div>
          ) : statusError ? (
            <p className={cn(BODY_MUTED, 'py-6 text-center')}>
              Couldn&apos;t check your connection status. Refresh to try again.
            </p>
          ) : !hasLinks ? (
            <p className={cn(BODY_MUTED, 'py-6 text-center')}>
              No browser connected yet. Generate a pairing code below to connect one.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {links.map((link) => (
                <li key={link.id} className="py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <MonitorSmartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className={cn(BODY, 'truncate font-medium')}>
                          {link.deviceLabel || 'Unnamed browser'}
                        </p>
                        <p className={cn(CAPTION, 'truncate font-mono')}>
                          {link.tokenPrefix} · last used {formatRelative(link.lastUsedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!rotateUnavailable && (
                        <button
                          type="button"
                          onClick={() => handleRotate(link)}
                          disabled={rotatingId === link.id}
                          title="Issue a new token for this browser and invalidate the old one"
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md border border-border/70 px-3 h-8 text-xs font-medium',
                            'text-foreground hover:bg-muted transition-colors duration-150 disabled:opacity-50',
                          )}
                        >
                          {rotatingId === link.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw size={12} />
                          )}
                          Rotate token
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRevoke(link)}
                        disabled={revokingId === link.id}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md border border-border/70 px-3 h-8 text-xs font-medium',
                          'text-destructive hover:bg-destructive/10 transition-colors duration-150 disabled:opacity-50',
                        )}
                      >
                        {revokingId === link.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        Revoke
                      </button>
                    </div>
                  </div>

                  {rotated?.linkId === link.id && (
                    <div className="rounded-xl bg-muted/60 p-3 space-y-2">
                      <p className={CAPTION}>
                        New token — copy it into the extension now. It won&apos;t be shown again.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs font-mono">
                          {rotated.token}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopyRotated}
                          className={cn(GHOST_PILL, 'border border-border/70 shrink-0')}
                        >
                          {rotateCopied ? <Check size={14} /> : <Copy size={14} />}
                          {rotateCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SurfaceCard>

      {/* ── Connect a browser ─────────────────────────────────────────── */}
      <SurfaceCard>
        <SurfaceCardHeader title="Connect a browser" />
        <p className={cn(BODY_MUTED, 'mt-2')}>
          Install the Chippi browser extension, then generate a code here and
          type it into the extension&apos;s popup to pair it to your account.
        </p>

        {pairing ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-muted/60 p-5 text-center space-y-2">
              <p className={SECTION_LABEL}>Pairing code</p>
              <p
                className="text-3xl font-semibold tracking-[0.3em] tabular-nums text-foreground"
                style={{ fontFamily: 'var(--font-title)' }}
              >
                {pairing.code}
              </p>
              <p className={CAPTION}>
                {secondsLeft > 0 ? `Expires in ${formatCountdown(secondsLeft)}` : 'Expired'}
              </p>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <button
                type="button"
                onClick={handleCopy}
                className={cn(GHOST_PILL, 'border border-border/70')}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy code'}
              </button>
              <button
                type="button"
                onClick={handleGenerateCode}
                disabled={issuing}
                className={GHOST_PILL}
              >
                {issuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                New code
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGenerateCode}
            disabled={issuing}
            className={cn(PRIMARY_PILL, 'mt-5')}
          >
            {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Generate pairing code
          </button>
        )}

        <p className={cn(CAPTION, 'mt-4')}>
          Codes are single-use and expire after {Math.round(PAIRING_CODE_TTL_SECONDS / 60)} minutes.
          Don&apos;t have the extension yet? Ask whoever set up your workspace
          for the install link — it isn&apos;t in the Chrome Web Store yet, so
          there&apos;s no public download page here to link to.
        </p>
      </SurfaceCard>

      {/* ── What Chippi can and can't do ──────────────────────────────── */}
      <SurfaceCard>
        <SurfaceCardHeader title="What this connects" action={<ShieldAlert className="h-4 w-4 text-muted-foreground" />} />
        <div className="mt-3 space-y-3">
          <div>
            <p className={cn(H3, 'text-sm')}>Two browsers, always labeled</p>
            <p className={BODY_MUTED}>
              Chippi can drive a browser two different ways, and it always
              tells you which one is active. When your own extension is
              paired (above), Chippi uses <strong>your paired browser</strong> for
              anything that needs your logins — Zillow, your MLS, your inbox.
              For public research that doesn&apos;t need a login — looking up
              listings, comps, neighborhood info — Chippi can instead use{' '}
              <strong>Chippi&apos;s cloud browser</strong>: a fresh browser Chippi runs
              for you. The cloud browser is <strong>not logged into any of your
              accounts</strong> and has no access to your paired extension or
              its cookies — it can only see what a signed-out visitor sees.
            </p>
          </div>
          <div>
            <p className={cn(H3, 'text-sm')}>Chippi can</p>
            <p className={BODY_MUTED}>
              When you ask, in chat: open a page, click something, type into a
              field, press a key, scroll, read what&apos;s on the page, and
              take a screenshot — in whichever browser (yours or the cloud
              one) the task calls for, using your own logins only when it&apos;s
              your paired browser. For a bigger goal (&ldquo;search Zillow for 3-bed
              homes under $600k and list the top 3&rdquo;), it can also work through up
              to about 10 steps on its own, pausing to check with you before
              any step that would submit a form, spend money, or send or
              publish something.
            </p>
          </div>
          <div>
            <p className={cn(H3, 'text-sm')}>Chippi can&apos;t</p>
            <p className={BODY_MUTED}>
              Run arbitrary code, or reach any tab, window, or account beyond
              the one browser it&apos;s driving for that task. In your paired
              browser you see a visible moving cursor and an orange banner on
              the page the whole time it&apos;s working; the cloud browser has no
              page of yours to show a banner on, so watch it instead through
              the live view in chat.
            </p>
          </div>
          <div>
            <p className={cn(H3, 'text-sm')}>The kill switch</p>
            <p className={BODY_MUTED}>
              In your paired browser, a floating Stop button appears on the
              page whenever Chippi is driving it, and the extension&apos;s popup
              has its own Stop/Resume. Revoking a device above cuts it off
              immediately and for good — you&apos;d need to pair again to
              reconnect. The cloud browser has no page of yours to put a Stop
              button on, so Stop in the chat panel is its control, and any
              cloud session left idle ends itself automatically after a few
              minutes.
            </p>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
