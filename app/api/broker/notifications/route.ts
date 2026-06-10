import { NextResponse } from 'next/server';
import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/broker/notifications
 * Returns the latest broker notifications.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: notifications } = await supabase
    .from('BrokerNotification')
    .select('*')
    .eq('brokerageId', ctx.brokerage.id)
    .order('createdAt', { ascending: false })
    .limit(20);

  return NextResponse.json({ notifications: notifications ?? [] });
}

/**
 * PATCH /api/broker/notifications
 * Mark all unread notifications as read.
 */
export async function PATCH() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('BrokerNotification')
    .update({ read: true })
    .eq('brokerageId', ctx.brokerage.id)
    .eq('read', false);
  if (error) {
    // Surface the failure — returning success on a failed write left the
    // client showing read while the DB still said unread.
    return NextResponse.json({ error: 'Could not mark notifications read' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
