import { redirect } from 'next/navigation';
import { Ticket } from 'lucide-react';
import { isPlatformAdmin } from '@/lib/permissions';
import { listInviteCodes } from '@/lib/billing/invite-codes';
import { AdminPageHeader } from '@/app/admin/components/admin-page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { InviteCodesClient } from './invite-codes-client';

/**
 * Admin → Invite codes. Mint codes that grant a Space FREE access (comp) at a
 * chosen plan, bypassing Stripe. Server-loads the list, then hands it to the
 * client table for create / deactivate. Admin-gated (redirect non-admins).
 */
export default async function AdminInviteCodesPage() {
  if (!(await isPlatformAdmin())) redirect('/');

  let codes;
  try {
    codes = await listInviteCodes();
  } catch (err) {
    console.error('[admin/invite-codes] page load failed', err);
    return (
      <div className="space-y-8 pb-12 max-w-5xl mx-auto">
        <AdminPageHeader eyebrow="Management." title="Invite codes" />
        <EmptyState
          icon={Ticket}
          title="Couldn’t load invite codes."
          description="This is usually temporary. Reload to try again."
          action={{ label: 'Reload', href: '/admin/invite-codes' }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 max-w-5xl mx-auto">
      <AdminPageHeader
        eyebrow="Management."
        title="Invite codes"
        subtitle={
          <>
            {codes.length} code{codes.length !== 1 ? 's' : ''}. Each grants a workspace free access at
            its plan — bypassing payment — only when redeemed.
          </>
        }
      />
      <InviteCodesClient initialCodes={codes} />
    </div>
  );
}
