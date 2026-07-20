import { getBrokerMemberContext } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { H1, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { SplitReveal } from '@/components/motion';
import TemplatesClient from './templates-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Templates — Teams' };

export default async function TemplatesPage() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) redirect('/');

  // Only the owner/admins can author the library; the write API routes
  // (POST/PATCH/DELETE/publish) hard-gate to those roles and 403 otherwise.
  // Realtor members can read the playbook but the write controls must be
  // hidden for them — surfacing buttons that always 403 is a broken flow.
  const canManage =
    ctx.membership.role === 'broker_owner' || ctx.membership.role === 'broker_admin';

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-56 md:pb-24">
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Templates.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          <SplitReveal as="span" text="The team’s playbook" />
        </h1>
        <p className={cn(BODY_MUTED)}>
          {canManage
            ? 'Write a message once. Push the latest to every agent.'
            : 'Your team’s shared message templates.'}
        </p>
      </header>

      <TemplatesClient canManage={canManage} />
    </div>
  );
}
