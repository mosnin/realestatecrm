import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { AcceptButton } from './accept-button';

type Params = { params: Promise<{ token: string }> };

interface InvitationDetail {
  id: string;
  status: string;
  email: string;
  roleToAssign: string;
  expiresAt: string;
  brokerageName: string;
  logoUrl: string | null;
}

const roleLabel = (role: string) =>
  role === 'broker_admin' ? 'Brokerage Admin' : 'Realtor';

export default async function AcceptInvitationPage({ params }: Params) {
  const { token } = await params;

  // Auth: must be signed in to accept
  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-up?redirect_url=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Fetch invitation directly from DB (avoids server-to-server HTTP which can fail on Vercel)
  let inv: InvitationDetail | null = null;
  let fetchError = '';
  try {
    const { data, error } = await supabase
      .from('Invitation')
      .select('id, status, email, roleToAssign, expiresAt, brokerageId, Brokerage(name, logoUrl)')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      console.error('[invite] DB query failed:', error);
      fetchError = 'Could not load invitation.';
    } else if (!data) {
      fetchError = 'Invitation not found or has expired.';
    } else {
      const brokerage = data.Brokerage as unknown as { name: string; logoUrl: string | null } | null;
      inv = {
        id: data.id,
        status: data.status,
        email: data.email,
        roleToAssign: data.roleToAssign,
        expiresAt: data.expiresAt,
        brokerageName: brokerage?.name ?? '',
        logoUrl: brokerage?.logoUrl ?? null,
      };
    }
  } catch (err) {
    console.error('[invite] Failed to load invitation:', err);
    fetchError = 'Could not load invitation.';
  }
  const isExpired = inv && new Date(inv.expiresAt) < new Date();
  const isExpiredOrInvalid = inv?.status === 'expired' || isExpired;
  const isAccepted = inv?.status === 'accepted';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-foreground px-6 py-5">
            <div className="flex items-center gap-2.5">
              {inv?.logoUrl ? (
                <img src={inv.logoUrl} alt="" className="h-6 max-w-[80px] object-contain rounded" />
              ) : (
                <Building2 size={20} className="text-background/70" />
              )}
              <p className="text-background font-semibold text-base">
                {inv?.brokerageName ?? 'Chippi'}
              </p>
            </div>
            <p className="mt-1 text-background/60 text-sm">Brokerage invitation</p>
          </div>

          <div className="px-6 py-6 space-y-4">
            {fetchError ? (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p className="text-sm">{fetchError}</p>
              </div>
            ) : isAccepted ? (
              <>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                  <p className="text-sm">This invitation has already been accepted.</p>
                </div>
                <a
                  href="/broker"
                  className="block text-center text-sm font-medium text-primary hover:underline underline-offset-2"
                >
                  Go to broker dashboard →
                </a>
              </>
            ) : isExpiredOrInvalid ? (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                <p className="text-sm">This invitation has expired or is no longer valid. Ask your broker to send a new one.</p>
              </div>
            ) : inv ? (
              <>
                <div>
                  <p className="text-sm text-foreground leading-relaxed">
                    You've been invited to join{' '}
                    <span className="font-semibold">{inv.brokerageName}</span> as a{' '}
                    <span className="font-semibold">{roleLabel(inv.roleToAssign)}</span>.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {inv.roleToAssign === 'broker_admin'
                      ? 'You\'ll get access to the brokerage dashboard to help manage the team. No subscription required.'
                      : 'You\'ll keep your own workspace, leads, and pipeline — this just adds you to the brokerage network.'}
                  </p>
                </div>
                <AcceptButton token={token} />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
