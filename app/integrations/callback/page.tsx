/**
 * /integrations/callback — where Composio redirects the realtor after a
 * successful OAuth flow.
 *
 * Composio's redirect URL accepts `connected_account_id` + (sometimes)
 * `status` + `app` query params. We:
 *   1. Look up the connected account on Composio's side
 *   2. Persist an IntegrationConnection row with toolkit + composio id
 *   3. Redirect the realtor back into the app — settings, ideally onto
 *      the integrations panel — with a success/error flag in the URL.
 *
 * Server component so the persistence happens before the realtor ever
 * sees a UI flash.
 */

import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { getComposio } from '@/lib/integrations/composio';
import { insertConnection, findActive, revoke } from '@/lib/integrations/connections';
import { findIntegration } from '@/lib/integrations/catalog';
import { logger } from '@/lib/logger';

export default async function IntegrationsCallback({
  searchParams,
}: {
  searchParams: Promise<{ connected_account_id?: string; status?: string; app?: string }>;
}) {
  const { connected_account_id: connectedAccountId, status, app: appQuery } =
    await searchParams;

  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  if (!connectedAccountId) {
    return redirect(buildBackUrl({ ok: false, reason: 'missing_account' }));
  }

  // Resolve the realtor's space — we won't ship without it.
  const { data: spaceRow } = await supabase
    .from('Space')
    .select('id, slug, ownerId')
    .eq('ownerId', (await getDbUserId(userId)) ?? '')
    .maybeSingle();
  const space = (spaceRow ?? null) as { id: string; slug: string } | null;
  if (!space) {
    return redirect(buildBackUrl({ ok: false, reason: 'no_space' }));
  }

  // Composio is the source of truth for what just connected. We pull
  // the toolkit slug from there rather than trust the query param.
  let toolkit: string | null = null;
  let label: string | null = null;
  try {
    const composio = getComposio();
    const account = await composio.connectedAccounts.get(connectedAccountId);
    toolkit = (account?.toolkit?.slug ?? appQuery ?? null) as string | null;
    // The API often surfaces the connected user's email or username on
    // the account; we fall back to the toolkit name otherwise.
    label = pickLabel(account);
  } catch (err) {
    logger.warn('[integrations.callback] account fetch failed', {
      connectedAccountId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (!toolkit) {
    return redirect(buildBackUrl({ ok: false, reason: 'unknown_toolkit' }));
  }

  // Reject toolkits we don't have in our catalog so a stray callback
  // doesn't write an orphan row.
  if (!findIntegration(toolkit)) {
    return redirect(buildBackUrl({ ok: false, reason: 'unsupported_toolkit', slug: space.slug }));
  }

  // Reconnect: revoke any prior active row for this triple before we
  // insert the new one. Same invariant the connect route holds.
  const existing = await findActive({ spaceId: space.id, userId, toolkit });
  if (existing) {
    await revoke(existing);
  }

  const inserted = await insertConnection({
    spaceId: space.id,
    userId,
    toolkit,
    composioConnectionId: connectedAccountId,
    label: label ?? undefined,
  });

  if (!inserted) {
    return redirect(buildBackUrl({ ok: false, reason: 'persist_failed', slug: space.slug }));
  }

  // Status from Composio: 'ACTIVE' is the green path. Anything else, we
  // mark it failed but keep the row so the realtor sees something
  // happened in the UI.
  if (status && status.toUpperCase() !== 'ACTIVE') {
    logger.warn('[integrations.callback] composio returned non-active status', {
      connectedAccountId,
      status,
    });
    return redirect(buildBackUrl({ ok: false, reason: status, slug: space.slug }));
  }

  return redirect(buildBackUrl({ ok: true, slug: space.slug, toolkit }));
}

async function getDbUserId(clerkId: string): Promise<string | null> {
  const { data } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

interface CallbackResultArgs {
  ok: boolean;
  reason?: string;
  slug?: string;
  toolkit?: string;
}

function buildBackUrl(args: CallbackResultArgs): string {
  const base = args.slug ? `/s/${args.slug}/settings` : `/`;
  const params = new URLSearchParams();
  params.set('integration', args.ok ? 'connected' : 'failed');
  if (args.reason) params.set('reason', args.reason);
  if (args.toolkit) params.set('toolkit', args.toolkit);
  return `${base}?${params.toString()}#integrations`;
}

/**
 * Pull a realtor-friendly label from Composio's account payload — usually
 * the connected user's email. Falls back to whatever Composio surfaces
 * under common naming variants. If none exist, we leave it null and the
 * UI just shows "Connected".
 */
function pickLabel(account: unknown): string | null {
  if (!account || typeof account !== 'object') return null;
  const a = account as Record<string, unknown>;
  const fromTop =
    (typeof a.email === 'string' && a.email) ||
    (typeof a.username === 'string' && a.username) ||
    null;
  if (fromTop) return fromTop;
  const data = a.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const fromData =
      (typeof d.email === 'string' && d.email) ||
      (typeof d.username === 'string' && d.username) ||
      null;
    if (fromData) return fromData;
  }
  return null;
}
