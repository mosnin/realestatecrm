import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { SpaceInviteAcceptButton } from './accept-button';

export default async function SpaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { userId } = await auth();
  if (!userId) {
    redirect(`/login/realtor?redirect_url=${encodeURIComponent(`/invite/space/${token}`)}`);
  }

  const clerkUser = await currentUser();
  const currentEmail = clerkUser?.emailAddresses[0]?.emailAddress ?? '';

  const { data: invite } = await unscoped(
    supabase.from('SpaceInvitation'),
    'load invitation by unguessable token for the accept page',
  )
    .select('email, role, status, expiresAt, spaceId')
    .eq('token', token)
    .maybeSingle();

  const { data: space } = invite
    ? await supabase.from('Space').select('name, slug').eq('id', invite.spaceId).maybeSingle()
    : { data: null };

  const expired = !invite || invite.status !== 'pending' || new Date(invite.expiresAt) < new Date();
  const emailMismatch =
    !!invite && currentEmail && invite.email.toLowerCase() !== currentEmail.toLowerCase();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Building2 size={18} />
          <p className="text-[11px] uppercase tracking-[0.16em]">Workspace invitation</p>
        </div>
        <h1 className="text-2xl tracking-tight text-foreground">
          {space?.name ?? 'A Chippi workspace'}
        </h1>
        {expired ? (
          <p className="text-sm text-muted-foreground">This invitation is no longer valid.</p>
        ) : emailMismatch ? (
          <p className="text-sm text-muted-foreground">
            This invite was sent to {invite.email}. Sign in with that email to join.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              You&apos;re invited to work in this business&apos;s book on Chippi.
            </p>
            <SpaceInviteAcceptButton token={token} />
          </>
        )}
      </div>
    </div>
  );
}
