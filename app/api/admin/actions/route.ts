import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient, auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { requireAdmin, logAdminAction } from '@/lib/admin';
import { shouldBackfillOnboardFromSpace } from '@/lib/onboarding';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  findBasePlanItem,
  planChangePriceId,
  planChangeItems,
  spacePlanDbFields,
  brokeragePlanDbFields,
  isSpacePlanChangeId,
  isBrokeragePlanChangeId,
  trialEndUnixInDays,
  type Cadence,
} from '@/lib/billing/admin-subscription';
import type { PlanId } from '@/lib/plans';
import type Stripe from 'stripe';
import type { User } from '@/lib/types';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

/**
 * Resolve the Stripe customer id for a refund/invoice operation. A brokerage
 * subscription bills the BROKERAGE's own customer (NOT the owner's personal
 * Space), so when accountType/accountId are supplied we read that table; for the
 * legacy/space flow we fall back to the Space owned by `userId`. Returns null
 * when no customer is on record.
 */
async function resolveStripeCustomerId(args: {
  accountType?: string;
  accountId?: string;
  userId?: string;
}): Promise<string | null> {
  if ((args.accountType === 'space' || args.accountType === 'brokerage') && args.accountId) {
    const table = args.accountType === 'space' ? 'Space' : 'Brokerage';
    const { data } = await supabase
      .from(table)
      .select('stripeCustomerId')
      .eq('id', args.accountId)
      .maybeSingle();
    return (data?.stripeCustomerId as string | null) ?? null;
  }
  if (args.userId) {
    const { data } = await supabase
      .from('Space')
      .select('stripeCustomerId')
      .eq('ownerId', args.userId)
      .maybeSingle();
    return (data?.stripeCustomerId as string | null) ?? null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  let admin: { userId: string };
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  const { allowed } = await checkRateLimit(`admin:${session.userId}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { action } = body;

  const ALLOWED_ACTIONS = ['send_password_reset', 'repair_onboarding', 'update_subscription', 'change_plan', 'cancel_subscription', 'list_invoices', 'suspend_user', 'unsuspend_user', 'comp_free_month', 'issue_refund', 'impersonate_user', 'force_password_reset', 'revoke_session', 'revoke_all_sessions', 'send_mfa_prompt'];
  if (!ALLOWED_ACTIONS.includes(action as string)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  try {
    // ── Send password reset ─────────────────────────────────────────────
    if (action === 'send_password_reset') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      // Look up the Clerk user to get their primary email
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );

      if (!primaryEmail) {
        return NextResponse.json(
          { error: 'User has no primary email address' },
          { status: 400 }
        );
      }

      // Create a password reset through Clerk's magic link flow
      // Clerk doesn't have a direct "send password reset" API endpoint,
      // but we can use the email address to create a sign-in token.
      // The safest approach: just document the Clerk dashboard path.
      // However, we CAN programmatically update the user's password
      // or create a sign-in link. For safety, we'll log the action
      // and direct the admin to use Clerk Dashboard for password resets.

      await logAdminAction({
        actor: admin.userId,
        action: 'send_password_reset',
        target: clerkId,
        details: { email: primaryEmail.emailAddress },
      });

      // Note: Clerk v7 doesn't expose a direct "send password reset email" API.
      // The recommended approach is to use the Clerk Dashboard or
      // set a temporary password. We'll log the request and inform the admin.
      return NextResponse.json({
        success: true,
        message: `Password reset requested for ${primaryEmail.emailAddress}. Use the Clerk Dashboard to complete this action, or the user can use the "Forgot password" flow at sign-in.`,
      });
    }

    // ── Repair onboarding state ─────────────────────────────────────────
    if (action === 'repair_onboarding') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('*, Space(id, slug)')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;

      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const row = userRow as User & { Space: { id: string; slug: string } | null };
      const user = {
        ...row,
        spaceId: row.Space?.id ?? null,
        slug: row.Space?.slug ?? null,
        space: row.Space ? { id: row.Space.id, slug: row.Space.slug } : null,
      };

      let repairAction = 'none';
      let message = 'No repair needed. User state is healthy.';

      if (shouldBackfillOnboardFromSpace(user)) {
        // Has space but onboard=false → backfill
        const { error } = await supabase
          .from('User')
          .update({
            onboard: true,
            onboardingCompletedAt: new Date().toISOString(),
            onboardingCurrentStep: 7,
          })
          .eq('id', user.id);
        if (error) throw error;
        repairAction = 'backfill_onboard';
        message = 'Backfilled onboard=true because workspace exists.';
      } else if (user.onboard && !user.space) {
        // Onboarded but no space → reset to re-onboard
        const { error } = await supabase
          .from('User')
          .update({
            onboard: false,
            onboardingCurrentStep: 1,
          })
          .eq('id', user.id);
        if (error) throw error;
        repairAction = 'reset_onboarding';
        message = 'Reset onboard=false and step=1 because workspace is missing.';
      }

      await logAdminAction({
        actor: admin.userId,
        action: 'repair_onboarding',
        target: userId,
        details: { repairAction, userOnboard: user.onboard, hasSpace: !!user.space },
      });

      return NextResponse.json({ success: true, repairAction, message });
    }

    // ── Update subscription status ───────────────────────────────────────
    // HARDENED (Fix #4): the UI now only offers the states that map to a REAL
    // Stripe operation (trialing → set trial_end; canceled → cancel). The old
    // `active` branch did `trial_end:'now'` — which does NOT make a sub "active a
    // year"; combined with handleCompAccount writing a 1-year stripePeriodEnd it
    // produced a DB-vs-Stripe desync → surprise re-bill. That branch is gone.
    // Any status WITHOUT a Stripe op is treated as an explicit DB-only OVERRIDE
    // (requires override:true) and is clearly labeled as such — never silently
    // written as if Stripe agreed.
    if (action === 'update_subscription') {
      // Per-action daily cap — like issue_refund, this can give away value, so
      // the shared 30/min admin limit isn't enough on its own.
      const { allowed: subAllowed } = await checkRateLimit(`admin:subupdate:${admin.userId}`, 50, 86400);
      if (!subAllowed) {
        return NextResponse.json({ error: 'Daily subscription-update limit reached.' }, { status: 429 });
      }
      const { userId, status, periodEnd, override } = body as {
        userId: string;
        status: string;
        periodEnd?: string;
        override?: boolean;
      };

      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      const VALID_STATUSES = ['trialing', 'past_due', 'canceled', 'unpaid', 'inactive'];
      if (!status || !VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }

      // Statuses that correspond to a real Stripe op. Everything else is a
      // DB-only override that must be opted into explicitly so an admin can't
      // accidentally write a status Stripe will overwrite on its next webhook.
      const STRIPE_BACKED_STATUSES = new Set(['trialing', 'canceled']);
      if (!STRIPE_BACKED_STATUSES.has(status) && !override) {
        return NextResponse.json(
          { error: `Status '${status}' has no Stripe operation — it would be a DB-only override that the next Stripe webhook can overwrite. Re-submit with override:true to force it, or use Cancel / Comp / Change plan for real billing changes.` },
          { status: 400 },
        );
      }

      const { data: spaceData, error: spaceLookupError } = await supabase
        .from('Space')
        .select('id, stripeSubscriptionId')
        .eq('ownerId', userId)
        .maybeSingle();

      if (spaceLookupError) throw spaceLookupError;

      if (!spaceData) {
        return NextResponse.json({ error: 'No space found for this user' }, { status: 404 });
      }

      // ── Sync to Stripe first ────────────────────────────────────────────
      // Supabase mirrors Stripe via webhook. If we only update Supabase,
      // the next webhook event will overwrite our change with Stripe's truth
      // and the user will be charged on the original schedule.
      let stripeUpdated = false;
      let stripeWarning: string | null = null;
      const subId = (spaceData as any).stripeSubscriptionId as string | null;

      if (subId) {
        try {
          const { getStripe } = await import('@/lib/stripe');
          const stripe = getStripe();

          if (status === 'trialing' && periodEnd) {
            await stripe.subscriptions.update(subId, {
              trial_end: Math.floor(new Date(periodEnd).getTime() / 1000),
              proration_behavior: 'none',
            });
            stripeUpdated = true;
          } else if (status === 'canceled') {
            await stripe.subscriptions.cancel(subId);
            stripeUpdated = true;
          } else {
            stripeWarning = `Status '${status}' is a DB-only override — Stripe was not changed. The next Stripe webhook for this subscription can overwrite it.`;
          }
        } catch (stripeErr: any) {
          console.error('[admin/update_subscription] Stripe update failed', { stripeErr, subId, status });
          stripeWarning = `Stripe update failed: ${stripeErr.message}. Database updated but billing may not reflect this change until manually corrected in Stripe.`;
        }
      } else {
        stripeWarning = 'No Stripe subscription on record — database updated only. Stripe has no record of this change.';
      }

      // Always mirror to Supabase as our local cache
      const updatePayload: Record<string, unknown> = { stripeSubscriptionStatus: status };
      if (periodEnd) updatePayload.stripePeriodEnd = periodEnd;

      const { error: updateError } = await supabase
        .from('Space')
        .update(updatePayload)
        .eq('id', spaceData.id);

      if (updateError) throw updateError;

      await logAdminAction({
        actor: admin.userId,
        action: 'update_subscription',
        target: userId,
        details: { status, periodEnd: periodEnd ?? null, spaceId: spaceData.id, stripeUpdated, override: !!override, stripeWarning },
      });

      const message = stripeWarning
        ? `Database updated. ⚠️ ${stripeWarning}`
        : `Subscription updated to '${status}'${stripeUpdated ? ' in Stripe and database' : ''}.`;

      return NextResponse.json({ success: true, message, stripeUpdated, stripeWarning: stripeWarning ?? undefined });
    }

    // ── Change plan (solo↔pro for spaces; team↔team_plus for brokerages) ──
    // Fix #2: a REAL plan-change action. We move the Stripe subscription item's
    // BASE price to the target plan's price (keeping the per-seat add-on line
    // untouched), THEN mirror plan/planActivatedAt (+ seatLimit for brokerage)
    // in the DB using the SAME mapping the webhook uses. Stripe is moved FIRST,
    // so even if the DB write lagged the next webhook would reconcile to the same
    // values — no desync, no silent under/over-billing.
    if (action === 'change_plan') {
      const { allowed: planAllowed } = await checkRateLimit(`admin:planchange:${admin.userId}`, 50, 86400);
      if (!planAllowed) {
        return NextResponse.json({ error: 'Daily plan-change limit reached.' }, { status: 429 });
      }
      const { accountType, accountId, plan, cadence: rawCadence, proration } = body as {
        accountType?: string;
        accountId?: string;
        plan?: string;
        cadence?: string;
        proration?: string;
      };

      if ((accountType !== 'space' && accountType !== 'brokerage') || !accountId || typeof accountId !== 'string') {
        return NextResponse.json({ error: 'accountType (space|brokerage) and accountId are required' }, { status: 400 });
      }
      // Validate + narrow the target plan for the account kind.
      const isSpaceAcct = accountType === 'space';
      if (isSpaceAcct ? !isSpacePlanChangeId(plan) : !isBrokeragePlanChangeId(plan)) {
        return NextResponse.json(
          { error: isSpaceAcct ? 'plan must be one of: solo, pro' : 'plan must be one of: team, team_plus' },
          { status: 400 },
        );
      }
      // After the guard, `plan` is a valid plan id for this account kind.
      const targetPlan = plan as PlanId;
      // Proration: default to a sensible 'create_prorations' (charge/credit the
      // difference for the rest of the cycle) — the fair behavior for a tier
      // change. Admin may pass 'none' to change tier without proration.
      const prorationBehavior = proration === 'none' ? 'none' : 'create_prorations';

      const table = accountType === 'space' ? 'Space' : 'Brokerage';
      const { data: acct, error: acctErr } = await supabase
        .from(table)
        .select('id, plan, stripeSubscriptionId, stripeSubscriptionStatus')
        .eq('id', accountId)
        .maybeSingle();
      if (acctErr) throw acctErr;
      if (!acct) return NextResponse.json({ error: `${accountType} not found` }, { status: 404 });

      const subId = (acct as any).stripeSubscriptionId as string | null;
      if (!subId) {
        return NextResponse.json(
          { error: 'No Stripe subscription on record — a plan change must move a live subscription. Have the customer subscribe first.' },
          { status: 400 },
        );
      }

      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();

      // Read the live subscription to find the BASE item + its cadence (so the
      // new price matches monthly/annual unless the admin overrides cadence).
      let subscription;
      try {
        subscription = await stripe.subscriptions.retrieve(subId);
      } catch (stripeErr: any) {
        return NextResponse.json({ error: `Couldn't load the Stripe subscription: ${stripeErr.message}` }, { status: 502 });
      }

      const base = findBasePlanItem(subscription);
      if (!base) {
        return NextResponse.json(
          { error: 'Could not identify the base plan line item on this subscription (price not mapped to a configured plan). Change it in the Stripe dashboard.' },
          { status: 409 },
        );
      }
      const cadence: Cadence = rawCadence === 'annual' ? 'annual' : rawCadence === 'monthly' ? 'monthly' : base.cadence;

      if (base.plan === targetPlan && cadence === base.cadence) {
        return NextResponse.json({ error: `Subscription is already on ${targetPlan} (${cadence}).` }, { status: 400 });
      }

      const newPriceId = planChangePriceId(targetPlan, cadence);
      if (!newPriceId) {
        return NextResponse.json(
          { error: `No Stripe price configured for ${targetPlan} (${cadence}). Set the STRIPE_PRICE_* env var first.` },
          { status: 503 },
        );
      }

      // Move Stripe FIRST.
      try {
        await stripe.subscriptions.update(subId, {
          items: planChangeItems(base.item.id, newPriceId),
          proration_behavior: prorationBehavior,
        });
      } catch (stripeErr: any) {
        console.error('[admin/change_plan] Stripe update failed', { stripeErr, subId, plan: targetPlan, cadence });
        return NextResponse.json({ error: `Stripe plan change failed: ${stripeErr.message}. No change was applied.` }, { status: 502 });
      }

      // Then mirror the DB with the SAME mapping the webhook uses.
      const dbFields = isSpaceAcct
        ? spacePlanDbFields(targetPlan as 'solo' | 'pro')
        : brokeragePlanDbFields(targetPlan as 'team' | 'team_plus');
      const { error: dbErr } = await supabase.from(table).update(dbFields).eq('id', accountId);
      if (dbErr) {
        // Stripe already moved; the webhook will reconcile the DB to match.
        console.error('[admin/change_plan] DB mirror failed (Stripe already moved — webhook will reconcile)', { dbErr, accountType, accountId });
      }

      await logAdminAction({
        actor: admin.userId,
        action: 'change_plan',
        target: `${accountType}:${accountId}`,
        details: { fromPlan: base.plan, toPlan: targetPlan, cadence, proration: prorationBehavior, subId, newPriceId },
      });

      return NextResponse.json({
        success: true,
        message: `Plan changed ${base.plan} → ${targetPlan} (${cadence}) in Stripe and database${dbErr ? ' (DB mirror will reconcile via webhook)' : ''}.`,
        fromPlan: base.plan,
        toPlan: targetPlan,
        cadence,
      });
    }

    // ── Cancel subscription (immediate vs end-of-period) ──────────────────
    // Fix #3: an explicit, clearly-labeled cancel control.
    //   immediate         → stripe.subscriptions.cancel (access ends now)
    //   end_of_period     → update(cancel_at_period_end:true) (access until end)
    // On IMMEDIATE cancel we set the DB plan consistently (free for space,
    // starter for brokerage — matching the webhook's customer.subscription.deleted
    // handler) instead of relying solely on the later webhook. End-of-period only
    // flags the schedule; the plan stays until Stripe actually deletes the sub.
    if (action === 'cancel_subscription') {
      const { allowed: cancelAllowed } = await checkRateLimit(`admin:cancel:${admin.userId}`, 50, 86400);
      if (!cancelAllowed) {
        return NextResponse.json({ error: 'Daily cancel limit reached.' }, { status: 429 });
      }
      const { accountType, accountId, mode } = body as {
        accountType?: string;
        accountId?: string;
        mode?: string;
      };
      if ((accountType !== 'space' && accountType !== 'brokerage') || !accountId || typeof accountId !== 'string') {
        return NextResponse.json({ error: 'accountType (space|brokerage) and accountId are required' }, { status: 400 });
      }
      const cancelMode = mode === 'immediate' ? 'immediate' : 'end_of_period';

      const table = accountType === 'space' ? 'Space' : 'Brokerage';
      const { data: acct, error: acctErr } = await supabase
        .from(table)
        .select('id, stripeSubscriptionId')
        .eq('id', accountId)
        .maybeSingle();
      if (acctErr) throw acctErr;
      if (!acct) return NextResponse.json({ error: `${accountType} not found` }, { status: 404 });

      const subId = (acct as any).stripeSubscriptionId as string | null;
      if (!subId) {
        return NextResponse.json({ error: 'No Stripe subscription on record to cancel.' }, { status: 400 });
      }

      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();

      try {
        if (cancelMode === 'immediate') {
          await stripe.subscriptions.cancel(subId);
        } else {
          await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
        }
      } catch (stripeErr: any) {
        console.error('[admin/cancel_subscription] Stripe cancel failed', { stripeErr, subId, cancelMode });
        return NextResponse.json({ error: `Stripe cancel failed: ${stripeErr.message}. No change was applied.` }, { status: 502 });
      }

      // Mirror the DB. Immediate → set status canceled + downgrade plan now
      // (don't wait for the webhook). End-of-period → leave plan/status; Stripe
      // keeps billing until the period ends and the deleted webhook downgrades.
      const dbUpdate: Record<string, unknown> =
        cancelMode === 'immediate'
          ? {
              stripeSubscriptionStatus: 'canceled',
              plan: accountType === 'space' ? 'free' : 'starter',
            }
          : {}; // end-of-period: status flips when Stripe sends the update webhook
      if (Object.keys(dbUpdate).length > 0) {
        const { error: dbErr } = await supabase.from(table).update(dbUpdate).eq('id', accountId);
        if (dbErr) console.error('[admin/cancel_subscription] DB mirror failed (webhook will reconcile)', { dbErr, accountType, accountId });
      }

      await logAdminAction({
        actor: admin.userId,
        action: 'cancel_subscription',
        target: `${accountType}:${accountId}`,
        details: { mode: cancelMode, subId },
      });

      return NextResponse.json({
        success: true,
        mode: cancelMode,
        message:
          cancelMode === 'immediate'
            ? 'Subscription canceled immediately in Stripe. Access ends now.'
            : 'Subscription will cancel at the end of the current billing period. Access continues until then.',
      });
    }

    // ── List recent invoices (for the refund picker) ─────────────────────
    // Read-only helper that powers the refund UI's invoice selector. Returns the
    // customer's recent invoices with the data the admin needs to choose one and
    // a partial amount (id, amount paid, currency, date, refundability).
    if (action === 'list_invoices') {
      const { userId: targetUserId, accountType, accountId } = body as {
        userId?: string;
        accountType?: string;
        accountId?: string;
      };
      const customerId = await resolveStripeCustomerId({ accountType, accountId, userId: targetUserId });
      if (!customerId) return NextResponse.json({ error: 'No Stripe customer' }, { status: 404 });

      const { getStripe } = await import('@/lib/stripe');
      const stripe = getStripe();
      const invoices = await stripe.invoices.list({ customer: customerId, limit: 10 });
      const list = invoices.data.map((inv) => {
        const paymentIntentId =
          (inv as unknown as { payment_intent?: string | null }).payment_intent ?? null;
        return {
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amountPaid: inv.amount_paid,
          amountRefundable: inv.amount_paid, // gross paid; Stripe caps actual refund at remaining
          currency: inv.currency,
          created: inv.created,
          refundable: inv.status === 'paid' && inv.amount_paid > 0 && !!paymentIntentId,
        };
      });
      return NextResponse.json({ success: true, invoices: list });
    }

    // ── Suspend user ─────────────────────────────────────────────────────
    if (action === 'suspend_user') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Look up the user to get their Clerk ID
      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('id, clerkId, email, platformRole')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;
      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const target = userRow as { id: string; clerkId: string; email: string; platformRole?: string };

      // Never suspend a platform admin: the ban overwrites platformRole with
      // 'banned' and unsuspend restores it to 'user', so suspending an admin
      // would permanently strip their admin access (and could lock out the last
      // admin). Refuse it.
      if (target.platformRole === 'admin') {
        return NextResponse.json({ error: 'Cannot suspend a platform admin.' }, { status: 403 });
      }

      // Ban the user in Clerk — prevents them from signing in
      await clerkClient.users.banUser(target.clerkId);

      // Also mark as banned in the DB so the middleware secondary check works
      // even if Clerk metadata hasn't propagated yet.
      await supabase
        .from('User')
        .update({ platformRole: 'banned' })
        .eq('id', userId);

      await logAdminAction({
        actor: admin.userId,
        action: 'suspend_user',
        target: userId,
        details: { clerkId: target.clerkId, email: target.email },
      });

      return NextResponse.json({
        success: true,
        message: `User ${target.email} has been suspended. They will be unable to sign in.`,
      });
    }

    // ── Unsuspend user ──────────────────────────────────────────────────
    if (action === 'unsuspend_user') {
      const { userId } = body as { userId: string };
      if (!userId || typeof userId !== 'string') {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      // Look up the user to get their Clerk ID
      const { data: userRow, error: userError } = await supabase
        .from('User')
        .select('id, clerkId, email')
        .eq('id', userId)
        .maybeSingle();

      if (userError) throw userError;
      if (!userRow) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const target = userRow as { id: string; clerkId: string; email: string };

      // Unban the user in Clerk — restores their ability to sign in
      await clerkClient.users.unbanUser(target.clerkId);

      // Restore platformRole in DB (back to 'user' — admins wouldn't be banned)
      await supabase
        .from('User')
        .update({ platformRole: 'user' })
        .eq('id', userId);

      await logAdminAction({
        actor: admin.userId,
        action: 'unsuspend_user',
        target: userId,
        details: { clerkId: target.clerkId, email: target.email },
      });

      return NextResponse.json({
        success: true,
        message: `User ${target.email} has been unsuspended. They can now sign in again.`,
      });
    }

    // ── Comp (free period via a REAL Stripe trial_end) ───────────────────
    // Fix #1: a comp MUST use a real Stripe mechanism so Stripe AND the DB
    // agree the customer isn't billed until the comp date. The previous code
    // (a) only pushed trial_end for past_due/unpaid and (b) wrote a far-future
    // stripePeriodEnd to the DB for EVERY status — including canceled/inactive
    // where Stripe has no live sub — so the DB said "active a year" while Stripe
    // re-billed on its own schedule → surprise charges.
    //
    // Now: we push the subscription's trial_end to the comp date whenever a live
    // Stripe subscription exists (past_due/unpaid/active/trialing all carry a
    // live sub), and we ONLY write the far-future stripePeriodEnd to the DB when
    // Stripe actually accepted that trial_end. If there's no live sub to move
    // (canceled/inactive, or no subscription id), we DO NOT fabricate a future
    // period in the DB — we report that a Stripe subscription must be created
    // first. `days` lets the same handler back both "comp a month" (30) and
    // "comp a year" (365); clamped 1..366.
    if (action === 'comp_free_month') {
      const { allowed: compAllowed } = await checkRateLimit(`admin:comp:${admin.userId}`, 20, 86400);
      if (!compAllowed) {
        return NextResponse.json({ error: 'Daily comp limit reached.' }, { status: 429 });
      }
      const { userId: targetUserId, days: rawDays } = body as { userId: string; days?: number };
      if (!targetUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
      const days = Math.max(1, Math.min(366, Number.isFinite(rawDays as number) ? Math.floor(rawDays as number) : 30));

      const { data: space } = await supabase
        .from('Space')
        .select('id, stripeSubscriptionStatus, stripeSubscriptionId')
        .eq('ownerId', targetUserId)
        .maybeSingle();

      if (!space) return NextResponse.json({ error: 'No workspace found' }, { status: 404 });

      const compSubId = (space as any).stripeSubscriptionId as string | null;
      const compStatus = (space as any).stripeSubscriptionStatus as string;
      // Statuses where Stripe still has a LIVE subscription we can push trial_end
      // on. canceled/inactive (and a missing sub id) have no live sub.
      const LIVE_SUB_STATUSES = new Set(['past_due', 'unpaid', 'active', 'trialing']);
      const hasLiveSub = !!compSubId && LIVE_SUB_STATUSES.has(compStatus ?? '');

      if (!hasLiveSub) {
        // No live Stripe subscription to comp. Refuse rather than write a fake
        // future period the DB can't back — that was the desync bug.
        return NextResponse.json(
          {
            error: `Subscription is '${compStatus || 'inactive'}' with no live Stripe subscription, so there's nothing to push a trial on. Create or reactivate a subscription in the Stripe dashboard first, then comp it.`,
          },
          { status: 400 },
        );
      }

      const trialEndUnix = trialEndUnixInDays(days);
      const periodEnd = new Date(trialEndUnix * 1000).toISOString();

      let stripeUpdated = false;
      let stripeWarning: string | null = null;
      let stripeStatus: string | null = null;
      try {
        const { getStripe } = await import('@/lib/stripe');
        const stripe = getStripe();
        const updated = await stripe.subscriptions.update(compSubId!, {
          trial_end: trialEndUnix,
          proration_behavior: 'none',
        });
        stripeUpdated = true;
        // Mirror the status Stripe reports (trial_end in the future → 'trialing').
        stripeStatus = (updated as { status?: string }).status ?? null;
      } catch (stripeErr: any) {
        console.error('[admin/comp_free_month] Stripe update failed', { stripeErr, compSubId });
        stripeWarning = `Stripe update failed: ${stripeErr.message}. No change applied — Stripe may still attempt to collect.`;
      }

      // Only mirror the comp into the DB when Stripe accepted it — otherwise the
      // DB would claim a free period Stripe never granted.
      if (stripeUpdated) {
        // Map Stripe's status into our enum; a future trial_end yields 'trialing'.
        const mappedStatus =
          stripeStatus === 'active' ? 'active'
          : stripeStatus === 'trialing' ? 'trialing'
          : 'trialing';
        await supabase.from('Space').update({
          stripeSubscriptionStatus: mappedStatus,
          stripePeriodEnd: periodEnd,
        }).eq('id', space.id);
      }

      await logAdminAction({ actor: admin.userId, action: 'comp_free_month', target: targetUserId, details: { days, periodEnd, stripeUpdated, stripeStatus, stripeWarning } });

      if (!stripeUpdated) {
        return NextResponse.json({ success: false, error: stripeWarning ?? 'Stripe update failed.' }, { status: 502 });
      }

      const message = `Comp applied in Stripe and database. The customer will not be charged until ${new Date(periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`;
      return NextResponse.json({ success: true, periodEnd, stripeUpdated, message });
    }

    // ── Issue refund ──────────────────────────────────────────────────────
    // Fix #6: the admin can choose WHICH invoice to refund (invoiceId, listed by
    // list_invoices) and a PARTIAL amount (in cents). Backward compatible: with
    // neither, it falls back to a FULL refund of the most recent paid invoice
    // (the prior behavior). Keeps the 3/day cap + audit log.
    if (action === 'issue_refund') {
      const { userId: targetUserId, invoiceId, amount: rawAmount, accountType, accountId } = body as {
        userId?: string;
        invoiceId?: string;
        amount?: number;
        accountType?: string;
        accountId?: string;
      };

      // Either a userId (space-by-owner) or an account (space|brokerage) is required.
      if ((!targetUserId || typeof targetUserId !== 'string') && !accountId) {
        return NextResponse.json({ error: 'userId or account is required' }, { status: 400 });
      }

      // Validate a partial amount up front (cents). Omitted/undefined → full refund.
      let partialAmount: number | undefined;
      if (rawAmount !== undefined && rawAmount !== null) {
        const n = Number(rawAmount);
        if (!Number.isInteger(n) || n <= 0) {
          return NextResponse.json({ error: 'amount must be a positive integer number of cents.' }, { status: 400 });
        }
        partialAmount = n;
      }

      // Per-admin refund limit: 3 per day
      const { allowed: refundAllowed } = await checkRateLimit(`refund:${admin.userId}`, 3, 86400);
      if (!refundAllowed) {
        return NextResponse.json({ error: 'Refund limit reached (max 3 per day). Try again tomorrow.' }, { status: 429 });
      }

      const customerId = await resolveStripeCustomerId({ accountType, accountId, userId: targetUserId });
      if (!customerId) return NextResponse.json({ error: 'No Stripe customer' }, { status: 404 });

      const stripe = (await import('@/lib/stripe')).getStripe();

      // Resolve the target invoice: the one the admin picked (verified to belong
      // to this customer), else the most recent PAID invoice.
      let invoice: Stripe.Invoice | undefined;
      if (invoiceId && typeof invoiceId === 'string') {
        try {
          invoice = await stripe.invoices.retrieve(invoiceId);
        } catch {
          return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
        }
        // Bind to this customer so an admin can't refund another customer's invoice.
        const invCustomer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
        if (invCustomer !== customerId) {
          return NextResponse.json({ error: 'Invoice does not belong to this customer.' }, { status: 400 });
        }
        if (invoice.status !== 'paid') {
          return NextResponse.json({ error: `Invoice is '${invoice.status}', not paid — nothing to refund.` }, { status: 400 });
        }
      } else {
        const invoices = await stripe.invoices.list({
          customer: customerId,
          status: 'paid',
          limit: 1,
        });
        invoice = invoices.data[0];
        if (!invoice) {
          return NextResponse.json({ error: 'No paid invoice found for this customer.' }, { status: 404 });
        }
      }

      // stripe.refunds.create() does not accept an `invoice` parameter — it
      // requires `charge` or `payment_intent`. Stripe 20.x dropped
      // `payment_intent` from the top-level Invoice type, but the API still
      // returns the string id on paid invoices.
      const paymentIntentId = (invoice as unknown as { payment_intent?: string | null }).payment_intent ?? null;
      if (!paymentIntentId) {
        return NextResponse.json({ error: 'Invoice has no associated payment intent.' }, { status: 400 });
      }
      // A partial refund can't exceed what was paid on this invoice.
      if (partialAmount !== undefined && partialAmount > invoice.amount_paid) {
        return NextResponse.json(
          { error: `Refund amount (${partialAmount}¢) exceeds the invoice's paid amount (${invoice.amount_paid}¢).` },
          { status: 400 },
        );
      }

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        ...(partialAmount !== undefined ? { amount: partialAmount } : {}),
      });
      const refundTarget = accountId ? `${accountType}:${accountId}` : targetUserId;
      await logAdminAction({ actor: admin.userId, action: 'issue_refund', target: refundTarget, details: { invoiceId: invoice.id, paymentIntent: paymentIntentId, refundId: refund.id, amount: refund.amount, partial: partialAmount !== undefined, customerId } });
      return NextResponse.json({ success: true, refundId: refund.id, amount: refund.amount });
    }

    // ── Impersonate user (create sign-in token) ─────────────────────────
    if (action === 'impersonate_user') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      try {
        // Sign-in tokens expire quickly and are single-use; safer than a password reset for impersonation.
        const token = await clerkClient.signInTokens.createSignInToken({
          userId: clerkId,
          expiresInSeconds: 600,
        });

        await logAdminAction({
          actor: admin.userId,
          action: 'impersonate_user',
          target: clerkId,
          details: { tokenId: token.id, expiresInSeconds: 600 },
        });

        return NextResponse.json({
          success: true,
          url: token.url,
          token: token.token,
          expiresInSeconds: 600,
          message: 'Sign-in link created. Open in an incognito/private window.',
        });
      } catch (err) {
        console.error('[admin-action] impersonate_user failed', err);
        await logAdminAction({
          actor: admin.userId,
          action: 'impersonate_user_failed',
          target: clerkId,
          details: { error: err instanceof Error ? err.message : String(err) },
        });
        return NextResponse.json(
          { error: 'Impersonation unavailable. Use the Clerk Dashboard to generate a sign-in link for this user.' },
          { status: 500 }
        );
      }
    }

    // ── Force password reset on next login ──────────────────────────────
    if (action === 'force_password_reset') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      const clerkUser = await clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );

      // Revoke all active sessions so the user is forced to re-authenticate, and
      // set a metadata flag the sign-in flow can read to require a password reset.
      const sessions = await clerkClient.sessions.getSessionList({ userId: clerkId, status: 'active' });
      const sessionList = Array.isArray(sessions) ? sessions : sessions.data;
      await Promise.all(sessionList.map((s) => clerkClient.sessions.revokeSession(s.id).catch(() => null)));

      await clerkClient.users.updateUserMetadata(clerkId, {
        publicMetadata: {
          ...(clerkUser.publicMetadata ?? {}),
          mustResetPassword: true,
          mustResetPasswordAt: new Date().toISOString(),
        },
      });

      await logAdminAction({
        actor: admin.userId,
        action: 'force_password_reset',
        target: clerkId,
        details: {
          email: primaryEmail?.emailAddress ?? null,
          sessionsRevoked: sessionList.length,
        },
      });

      return NextResponse.json({
        success: true,
        message: `All ${sessionList.length} active session(s) revoked. User must use "Forgot password" to sign in again.`,
      });
    }

    // ── Revoke a single session ─────────────────────────────────────────
    if (action === 'revoke_session') {
      const { sessionId, clerkId } = body as { sessionId: string; clerkId?: string };
      if (!sessionId || typeof sessionId !== 'string') {
        return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
      }

      await clerkClient.sessions.revokeSession(sessionId);

      await logAdminAction({
        actor: admin.userId,
        action: 'revoke_session',
        target: clerkId ?? sessionId,
        details: { sessionId },
      });

      return NextResponse.json({ success: true, message: 'Session revoked.' });
    }

    // ── Revoke all sessions for a user ──────────────────────────────────
    if (action === 'revoke_all_sessions') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      const sessions = await clerkClient.sessions.getSessionList({ userId: clerkId, status: 'active' });
      const sessionList = Array.isArray(sessions) ? sessions : sessions.data;
      const results = await Promise.all(
        sessionList.map((s) =>
          clerkClient.sessions.revokeSession(s.id).then(
            () => ({ id: s.id, ok: true }),
            () => ({ id: s.id, ok: false }),
          )
        )
      );
      const revoked = results.filter((r) => r.ok).length;

      await logAdminAction({
        actor: admin.userId,
        action: 'revoke_all_sessions',
        target: clerkId,
        details: { total: sessionList.length, revoked },
      });

      return NextResponse.json({
        success: true,
        message: `Revoked ${revoked} of ${sessionList.length} active session(s).`,
      });
    }

    // ── Send MFA enrollment prompt email ────────────────────────────────
    if (action === 'send_mfa_prompt') {
      const { clerkId } = body as { clerkId: string };
      if (!clerkId || typeof clerkId !== 'string') {
        return NextResponse.json({ error: 'clerkId is required' }, { status: 400 });
      }

      const clerkUser = await clerkClient.users.getUser(clerkId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      );
      if (!primaryEmail) {
        return NextResponse.json({ error: 'User has no primary email address' }, { status: 400 });
      }

      const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
      const { sendMfaEnrollmentPrompt } = await import('@/lib/email');
      await sendMfaEnrollmentPrompt({ toEmail: primaryEmail.emailAddress, userName: displayName });

      await logAdminAction({
        actor: admin.userId,
        action: 'send_mfa_prompt',
        target: clerkId,
        details: { email: primaryEmail.emailAddress, twoFactorEnabled: clerkUser.twoFactorEnabled },
      });

      return NextResponse.json({
        success: true,
        message: `MFA enrollment prompt sent to ${primaryEmail.emailAddress}.`,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin-action] failed', { action, error: err });
    return NextResponse.json(
      { error: "Server hiccup — usually temporary." },
      { status: 500 }
    );
  }
}
