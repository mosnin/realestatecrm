import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
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
    // Middleware already redirects unauthenticated users to /login/realtor with redirect_url set
    redirect(`/login/realtor?redirect_url=/invite/${token}`);
  }

  // Fetch invitation details
  let inv: InvitationDetail | null = null;
  let fetchError = '';
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
    const res = await fetch(`${appUrl}/api/invitations/${token}`, { cache: 'no-store' });
    if (res.ok) {
      inv = await res.json();
    } else {
      const data = await res.json();
      fetchError = data.error ?? 'Invitation not found.';
    }
  } catch {
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
                    You'll keep your own workspace, leads, and pipeline — this just adds you to the brokerage network.
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
