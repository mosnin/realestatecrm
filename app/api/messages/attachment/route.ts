import { NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { channelIdsForUser } from '@/lib/messaging';
import { getSignedDownloadUrl } from '@/lib/storage';
import { tenantTable } from '@/lib/tenant-db';


export const runtime = 'nodejs';

/**
 * GET /api/messages/attachment?key=<storageKey> — download a message
 * attachment. Attachments are stored PRIVATE; this route is the only way to
 * reach one. Access requires that the caller be a member of a channel that
 * actually contains a (non-deleted) message referencing this key — so a
 * private channel's files never leak to non-members. On success we 302 to a
 * short-lived signed URL.
 */
export async function GET(req: Request) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const key = new URL(req.url).searchParams.get('key');
  if (!key || !key.startsWith(`message-attachments/${ctx.brokerage.id}/`)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const myChannels = await channelIdsForUser(ctx.brokerage.id, ctx.dbUserId);
  if (!myChannels.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A message the caller can see must reference this attachment.
  const { data } = await tenantTable(supabase, 'ChannelMessage', { brokerageId: ctx.brokerage.id })
    .select('id')
    .in('channelId', myChannels)
    .is('deletedAt', null)
    .contains('attachments', [{ fileId: key }])
    .limit(1);
  if (!data?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const signed = await getSignedDownloadUrl(key);
  return NextResponse.redirect(signed);
}
