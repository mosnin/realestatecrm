import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, Mail, ShieldCheck, UserCircle } from 'lucide-react';

export default async function BrokerageInvitesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  // Get the current user's email
  let userEmail: string | null = null;
  try {
    const { data: user, error } = await supabase
      .from('User')
      .select('email')
      .eq('clerkId', userId)
      .maybeSingle();
    if (error) throw error;
    userEmail = user?.email?.toLowerCase() ?? null;
  } catch (err) {
    console.error('[settings/brokerage] Failed to fetch user', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/settings`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="space-y-1">
          <h2 className="text-base font-medium text-foreground">Brokerage Invites</h2>
          <p className="text-[13px] text-muted-foreground">No email address found for your account.</p>
        </div>
      </div>
    );
  }

  // Fetch pending invitations for this user's email
  let invitations: Array<{
    id: string;
    email: string;
    roleToAssign: string;
    token: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    Brokerage: { id: string; name: string } | null;
  }> = [];

  try {
    const { data, error } = await supabase
      .from('Invitation')
      .select('id, email, roleToAssign, token, status, expiresAt, createdAt, Brokerage(id, name)')
      .ilike('email', userEmail)
      .eq('status', 'pending')
      .order('createdAt', { ascending: false });
    if (error) throw error;
    invitations = (data ?? []) as unknown as typeof invitations;
  } catch (err) {
    console.error('[settings/brokerage] Failed to fetch invitations', err);
  }

  const roleLabel = (role: string) => (role === 'broker_admin' ? 'Admin' : 'Member');

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">Brokerage Invites</h2>
        <p className="text-[13px] text-muted-foreground">
          Pending brokerage invitations sent to {userEmail}
        </p>
      </div>

      {invitations.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center space-y-2">
            <Mail className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No pending invitations</p>
            <p className="text-xs text-muted-foreground/70">
              When a brokerage invites you, it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => {
            const brokerageName = Array.isArray(inv.Brokerage)
              ? (inv.Brokerage as any)[0]?.name
              : inv.Brokerage?.name;
            const expiresAt = new Date(inv.expiresAt);
            const isExpired = expiresAt < new Date();
            const sentAt = new Date(inv.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={inv.id}
                className="rounded-xl border border-border bg-card px-5 py-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {brokerageName ?? 'Unknown Brokerage'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${
                            inv.roleToAssign === 'broker_admin'
                              ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                              : 'text-muted-foreground bg-muted'
                          }`}
                        >
                          {inv.roleToAssign === 'broker_admin' ? (
                            <ShieldCheck size={11} />
                          ) : (
                            <UserCircle size={11} />
                          )}
                          Invited as {roleLabel(inv.roleToAssign)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Sent {sentAt}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {isExpired ? (
                      <span className="text-xs font-medium text-muted-foreground bg-muted rounded-full px-3 py-1.5">
                        Expired
                      </span>
                    ) : (
                      <a
                        href={`/invite/${inv.token}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 transition-colors"
                      >
                        Accept
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
