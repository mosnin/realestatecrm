import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { logAdminAction } from '@/lib/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';
import {
  getCreditBalance,
  getRecentTxns,
  grantCredits,
  refundCredits,
  type BillingAccount,
} from '@/lib/billing/credits';
import { CREDIT_ROLLOVER_DAYS } from '@/lib/plans';

/**
 * Platform-admin billing tools — view an account's plan + credit balance +
 * recent ledger, grant credits ("add usage"), and refund a debit. All gated by
 * requirePlatformAdmin(). The account is { space | brokerage, id }; credit ops
 * route through the same atomic ledger functions the rest of the app uses.
 */

function parseAccount(type: unknown, id: unknown): BillingAccount | null {
  if ((type === 'space' || type === 'brokerage') && typeof id === 'string' && id) {
    return { type, id };
  }
  return null;
}

async function lookupPlan(acc: BillingAccount): Promise<string | null> {
  const table = acc.type === 'space' ? 'Space' : 'Brokerage';
  const { data } = await supabase.from(table).select('plan').eq('id', acc.id).maybeSingle();
  return (data?.plan as string) ?? null;
}

/** Current complimentary-access state for an account (resilient to missing columns). */
async function lookupComp(
  acc: BillingAccount,
): Promise<{ compAccess: boolean; compExpiresAt: string | null; compNote: string | null }> {
  const table = acc.type === 'space' ? 'Space' : 'Brokerage';
  try {
    const { data } = await supabase
      .from(table)
      .select('compAccess, compExpiresAt, compNote')
      .eq('id', acc.id)
      .maybeSingle();
    return {
      compAccess: (data?.compAccess as boolean) ?? false,
      compExpiresAt: (data?.compExpiresAt as string) ?? null,
      compNote: (data?.compNote as string) ?? null,
    };
  } catch {
    return { compAccess: false, compExpiresAt: null, compNote: null };
  }
}

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const account = parseAccount(url.searchParams.get('accountType'), url.searchParams.get('accountId'));
  if (!account) {
    return NextResponse.json({ error: 'accountType (space|brokerage) and accountId are required' }, { status: 400 });
  }
  // Lightweight path for the comp control: just the comp status, no balance/ledger.
  if (url.searchParams.get('compOnly') === '1') {
    return NextResponse.json({ account, comp: await lookupComp(account) });
  }
  try {
    const [plan, balance, txns, comp] = await Promise.all([
      lookupPlan(account),
      getCreditBalance(account),
      getRecentTxns(account, 30),
      lookupComp(account),
    ]);
    return NextResponse.json({ account, plan, balance, txns, comp });
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let clerkUserId: string;
  try {
    ({ clerkUserId } = await requirePlatformAdmin());
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Throttle this money-moving surface — these ops mint/reverse credits (value).
  // Every other admin mutation is rate-limited; this one wasn't.
  const { allowed } = await checkRateLimit(`admin:billing:${clerkUserId}`, 20, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action;

  if (action === 'grant') {
    const account = parseAccount(body.accountType, body.accountId);
    if (!account) return NextResponse.json({ error: 'account required' }, { status: 400 });
    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
      return NextResponse.json({ error: 'amount must be a positive integer ≤ 1,000,000' }, { status: 400 });
    }
    const expiresAt = body.expiry === 'never' ? null : new Date(Date.now() + CREDIT_ROLLOVER_DAYS * 86400_000);
    try {
      await grantCredits(account, amount, 'manual_admin', expiresAt);
      // Audit every credit issuance — without this, a manual grant left no trail
      // in /admin/audit-log, unlike every other privileged admin action.
      await logAdminAction({
        actor: clerkUserId,
        action: 'billing_grant_credits',
        target: `${account.type}:${account.id}`,
        details: { amount, expiry: body.expiry === 'never' ? 'never' : `${CREDIT_ROLLOVER_DAYS}d` },
      });
      const balance = await getCreditBalance(account);
      return NextResponse.json({ ok: true, balance });
    } catch {
      return NextResponse.json({ error: 'Grant failed' }, { status: 500 });
    }
  }

  if (action === 'refund') {
    const account = parseAccount(body.accountType, body.accountId);
    if (!account) return NextResponse.json({ error: 'account required' }, { status: 400 });
    const txnId = typeof body.txnId === 'string' ? body.txnId : '';
    if (!txnId) return NextResponse.json({ error: 'txnId required' }, { status: 400 });
    try {
      // Bind the refund to the account in context — refundCredits(txnId) would
      // otherwise reverse ANY transaction in the system by id, so a stale/wrong
      // txnId could silently refund an unrelated account's debit.
      const { data: txn } = await supabase
        .from('CreditTxn')
        .select('accountType, accountId')
        .eq('id', txnId)
        .maybeSingle();
      if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
      if (txn.accountType !== account.type || txn.accountId !== account.id) {
        return NextResponse.json({ error: 'Transaction does not belong to this account' }, { status: 400 });
      }
      await refundCredits(txnId);
      await logAdminAction({
        actor: clerkUserId,
        action: 'billing_refund_credits',
        target: `${account.type}:${account.id}`,
        details: { txnId },
      });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Refund failed' }, { status: 500 });
    }
  }

  // ── Complimentary access — Stripe-INDEPENDENT free access for internal team /
  //    demo accounts. Writes only the comp columns; never touches Stripe. ──────
  if (action === 'grant_comp') {
    const account = parseAccount(body.accountType, body.accountId);
    if (!account) return NextResponse.json({ error: 'account required' }, { status: 400 });
    // Optional time-box (days from now). Omit/blank/null = no expiry (free until revoked).
    let expiresAt: string | null = null;
    if (body.days != null && body.days !== '') {
      const days = Number(body.days);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        return NextResponse.json(
          { error: 'days must be a positive number ≤ 3650, or omitted for no expiry' },
          { status: 400 },
        );
      }
      expiresAt = new Date(Date.now() + days * 86400_000).toISOString();
    }
    const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
    const table = account.type === 'space' ? 'Space' : 'Brokerage';
    const { error } = await supabase
      .from(table)
      .update({ compAccess: true, compExpiresAt: expiresAt, compNote: note })
      .eq('id', account.id);
    if (error) return NextResponse.json({ error: 'Could not grant comp access' }, { status: 500 });
    await logAdminAction({
      actor: clerkUserId,
      action: 'billing_grant_comp',
      target: `${account.type}:${account.id}`,
      details: { expiresAt: expiresAt ?? 'never', note },
    });
    return NextResponse.json({ ok: true, comp: { compAccess: true, compExpiresAt: expiresAt, compNote: note } });
  }

  if (action === 'revoke_comp') {
    const account = parseAccount(body.accountType, body.accountId);
    if (!account) return NextResponse.json({ error: 'account required' }, { status: 400 });
    const table = account.type === 'space' ? 'Space' : 'Brokerage';
    const { error } = await supabase
      .from(table)
      .update({ compAccess: false, compExpiresAt: null, compNote: null })
      .eq('id', account.id);
    if (error) return NextResponse.json({ error: 'Could not revoke comp access' }, { status: 500 });
    await logAdminAction({
      actor: clerkUserId,
      action: 'billing_revoke_comp',
      target: `${account.type}:${account.id}`,
    });
    return NextResponse.json({ ok: true, comp: { compAccess: false, compExpiresAt: null, compNote: null } });
  }

  return NextResponse.json(
    { error: 'Unknown action (expected grant | refund | grant_comp | revoke_comp)' },
    { status: 400 },
  );
}
