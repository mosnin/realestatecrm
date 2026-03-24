import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceForUser } from '@/lib/space';
import { audit } from '@/lib/audit';
import { isValidSlug, normalizeSlug } from '@/lib/intake';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    slug,
    emoji,
    notifications,
    smsNotifications,
    notifyNewLeads,
    notifyTourBookings,
    notifyNewDeals,
    notifyFollowUps,
  } = body;

  // Sanitize and cap all free-text fields to prevent storage DoS and injection
  const name            = typeof body.name            === 'string' ? body.name.slice(0, 100)            : '';
  const phoneNumber     = typeof body.phoneNumber     === 'string' ? body.phoneNumber.slice(0, 50)       : null;
  const myConnections   = typeof body.myConnections   === 'string' ? body.myConnections.slice(0, 500)    : null;
  const aiPersonalization = typeof body.aiPersonalization === 'string' ? body.aiPersonalization.slice(0, 1000) : null;
  const billingSettings = typeof body.billingSettings === 'string' ? body.billingSettings.slice(0, 2000) : null;
  // Anthropic key: validate prefix format; reject anything that looks wrong
  const rawKey = typeof body.anthropicApiKey === 'string' ? body.anthropicApiKey.trim() : '';
  const anthropicApiKey = rawKey === '' || rawKey.startsWith('sk-ant-') ? (rawKey || null) : null;

  const { data: spaceRows, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, createdAt, ownerId')
    .eq('slug', slug);
  if (spaceError) throw spaceError;
  if (!spaceRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = spaceRows[0];

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updateFields: Record<string, unknown> = { name };
  if (emoji !== undefined) updateFields.emoji = emoji;

  // Handle slug change
  const rawNewSlug = typeof body.newSlug === 'string' ? body.newSlug.trim() : '';
  if (rawNewSlug && rawNewSlug !== slug) {
    const sanitized = normalizeSlug(rawNewSlug);
    if (!isValidSlug(sanitized) || sanitized !== rawNewSlug) {
      return NextResponse.json({ error: 'Only lowercase letters, numbers, and hyphens allowed (min 3 chars)' }, { status: 400 });
    }
    // Check uniqueness
    const { data: existing } = await supabase
      .from('Space')
      .select('id')
      .eq('slug', sanitized)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
    }
    updateFields.slug = sanitized;
  }

  const { data: updatedRows, error: updateError } = await supabase
    .from('Space')
    .update(updateFields)
    .eq('slug', slug)
    .select('id, slug, name, emoji, createdAt, ownerId');
  if (updateError) {
    const errMsg = updateError.message || '';
    if (errMsg.includes('duplicate key') || errMsg.includes('unique') || updateError.code === '23505') {
      return NextResponse.json({ error: 'That slug is already taken' }, { status: 409 });
    }
    throw updateError;
  }

  const { error: settingsError } = await supabase
    .from('SpaceSetting')
    .upsert(
      {
        id: crypto.randomUUID(),
        spaceId: space.id,
        notifications,
        smsNotifications: typeof smsNotifications === 'boolean' ? smsNotifications : false,
        notifyNewLeads: typeof notifyNewLeads === 'boolean' ? notifyNewLeads : true,
        notifyTourBookings: typeof notifyTourBookings === 'boolean' ? notifyTourBookings : true,
        notifyNewDeals: typeof notifyNewDeals === 'boolean' ? notifyNewDeals : true,
        notifyFollowUps: typeof notifyFollowUps === 'boolean' ? notifyFollowUps : true,
        phoneNumber,
        myConnections,
        aiPersonalization,
        billingSettings,
        anthropicApiKey: anthropicApiKey || null,
      },
      { onConflict: 'spaceId' }
    )
    .select();
  if (settingsError) throw settingsError;

  // Update Redis cache
  const updatedSpace = updatedRows![0];
  const existing = await redis.get<any>(`slug:${slug}`).catch(() => null);
  if (existing) {
    // If slug changed, delete old key and set new one
    if (updatedSpace.slug !== slug) {
      await redis.del(`slug:${slug}`).catch(() => null);
      await redis.set(`slug:${updatedSpace.slug}`, { ...existing, slug: updatedSpace.slug, emoji: updatedSpace.emoji }).catch(() => null);
    } else {
      await redis.set(`slug:${slug}`, { ...existing, emoji }).catch(() => null);
    }
  }

  void audit({ actorClerkId: userId, action: 'UPDATE', resource: 'Space', resourceId: space.id, spaceId: space.id, req, metadata: updatedSpace.slug !== slug ? { oldSlug: slug, newSlug: updatedSpace.slug } : undefined });

  return NextResponse.json(updatedSpace);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await req.json();

  const { data: spaceRows, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug, name, emoji, createdAt, ownerId')
    .eq('slug', slug);
  if (spaceError) throw spaceError;
  if (!spaceRows?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const space = spaceRows[0];

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || space.id !== userSpace.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await redis.del(`slug:${slug}`).catch(() => null);

  // Audit BEFORE delete so we still have the spaceId in the log
  void audit({
    actorClerkId: userId,
    action: 'DELETE',
    resource: 'Space',
    resourceId: space.id,
    spaceId: space.id,
    req,
    metadata: { slug: space.slug, name: space.name },
  });

  const { error: deleteError } = await supabase
    .from('Space')
    .delete()
    .eq('slug', slug);
  if (deleteError) throw deleteError;

  return NextResponse.json({ success: true });
}
