import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendFollowUpDigest } from '@/lib/email';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/follow-up-reminders] CRON_SECRET env var is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  // Get contacts with follow-ups that are overdue or due today (within last 24h)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: contacts, error: contactError } = await supabase
    .from('Contact')
    .select('id, name, phone, followUpAt, spaceId')
    .lte('followUpAt', now.toISOString())
    .gte('followUpAt', yesterday.toISOString());
  if (contactError) throw contactError;

  if (!contacts?.length) return NextResponse.json({ sent: 0 });

  // Group by spaceId
  const bySpace: Record<string, typeof contacts> = {};
  for (const c of contacts) {
    bySpace[c.spaceId] = [...(bySpace[c.spaceId] ?? []), c];
  }

  let sent = 0;
  for (const [spaceId, spaceContacts] of Object.entries(bySpace)) {
    const { data: space } = await supabase
      .from('Space')
      .select('name, slug, ownerId')
      .eq('id', spaceId)
      .single();
    if (!space) continue;

    const { data: setting } = await supabase
      .from('SpaceSetting')
      .select('notifications')
      .eq('spaceId', spaceId)
      .maybeSingle();
    // Skip if notifications explicitly disabled
    if (setting?.notifications === false) continue;

    const { data: user } = await supabase
      .from('User')
      .select('email')
      .eq('id', space.ownerId)
      .single();
    if (!user?.email) continue;

    try {
      await sendFollowUpDigest({
        toEmail: user.email,
        spaceName: space.name,
        spaceSlug: space.slug,
        contacts: spaceContacts.map((c) => ({
          name: c.name,
          phone: c.phone,
          followUpAt: c.followUpAt,
        })),
      });
      sent++;
    } catch (err) {
      console.error('[cron/follow-up-reminders] Failed to send digest', { spaceId, error: err });
    }
  }

  return NextResponse.json({ sent });
}
