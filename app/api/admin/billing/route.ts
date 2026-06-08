import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/permissions';
import { logAdminAction } from '@/lib/admin';
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
  try {
    const [plan, balance, txns] = await Promise.all([
      lookupPlan(account),
      getCreditBalance(account),
      getRecentTxns(account, 30),
    ]);
    return NextResponse.json({ account, plan, balance, txns });
  } catch {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let adminClerkId: string;
  try {
    ({ clerkUserId: adminClerkId } = await requirePlatformAdmin());
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
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
      const balance = await getCreditBalance(account);
      await logAdminAction({
        actor: adminClerkId,
        action: 'grant_credits',
        target: account.id,
        details: { accountType: account.type, amount, expiry: expiresAt ? 'rollover' : 'never', balanceAfter: balance },
      });
      return NextResponse.json({ ok: true, balance });
    } catch {
      return NextResponse.json({ error: 'Grant failed' }, { status: 500 });
    }
  }

  if (action === 'refund') {
    const txnId = typeof body.txnId === 'string' ? body.txnId : '';
    if (!txnId) return NextResponse.json({ error: 'txnId required' }, { status: 400 });
    try {
      await refundCredits(txnId);
      await logAdminAction({
        actor: adminClerkId,
        action: 'refund_credits',
        target: txnId,
        details: { txnId },
      });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Refund failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action (expected grant | refund)' }, { status: 400 });
}
