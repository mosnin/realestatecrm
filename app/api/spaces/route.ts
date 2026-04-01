import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { redis } from '@/lib/redis';
import { getSpaceForUser } from '@/lib/space';
import crypto from 'crypto';
import { audit } from '@/lib/audit';
import { isValidSlug, normalizeSlug } from '@/lib/intake';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 });

  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.slug !== slug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: settings }, { data: owner }] = await Promise.all([
    supabase
      .from('SpaceSetting')
      .select('notifications, smsNotifications, notifyNewLeads, notifyTourBookings, notifyNewDeals, notifyFollowUps, phoneNumber')
      .eq('spaceId', userSpace.id)
      .maybeSingle(),
    supabase
      .from('User')
      .select('email')
      .eq('id', userSpace.ownerId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    settings: {
      notifications: settings?.notifications ?? true,
      smsNotifications: settings?.smsNotifications ?? false,
      notifyNewLeads: settings?.notifyNewLeads ?? true,
      notifyTourBookings: settings?.notifyTourBookings ?? true,
      notifyNewDeals: settings?.notifyNewDeals ?? true,
      notifyFollowUps: settings?.notifyFollowUps ?? true,
      phoneNumber: settings?.phoneNumber ?? '',
    },
    ownerEmail: owner?.email ?? '',
  });
}

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
  // phoneNumber: use undefined (not null) when absent so we can skip it in the upsert
  const phoneNumber     = typeof body.phoneNumber     === 'string' ? body.phoneNumber.slice(0, 50)       : undefined;
  const myConnections   = typeof body.myConnections   === 'string' ? body.myConnections.slice(0, 500)    : undefined;
  const aiPersonalization = typeof body.aiPersonalization === 'string' ? body.aiPersonalization.slice(0, 1000) : undefined;
  const billingSettings = typeof body.billingSettings === 'string' ? body.billingSettings.slice(0, 2000) : undefined;
  const bio             = typeof body.bio             === 'string' ? body.bio.slice(0, 500)             : undefined;
  const socialLinks     = body.socialLinks && typeof body.socialLinks === 'object' ? body.socialLinks    : undefined;
  const logoUrl         = typeof body.logoUrl         === 'string' ? body.logoUrl.slice(0, 500)         : undefined;
  // Anthropic key: validate prefix format; reject anything that looks wrong
  const rawKey = typeof body.anthropicApiKey === 'string' ? body.anthropicApiKey.trim() : undefined;
  const anthropicApiKey = rawKey === undefined ? undefined : (rawKey === '' || rawKey.startsWith('sk-ant-') ? (rawKey || null) : null);

  // Legal & compliance fields
  const rawPrivacyPolicyUrl = typeof body.privacyPolicyUrl === 'string' ? body.privacyPolicyUrl.trim().slice(0, 500) : undefined;
  const consentCheckboxLabel = typeof body.consentCheckboxLabel === 'string' ? body.consentCheckboxLabel.trim().slice(0, 500) : undefined;
  // Privacy Policy HTML (rich text content, capped at 100KB)
  const privacyPolicyHtml = body.privacyPolicyHtml !== undefined
    ? (typeof body.privacyPolicyHtml === 'string' ? body.privacyPolicyHtml.slice(0, 100_000) : null)
    : undefined;

  // Validate privacy policy URL if provided
  if (rawPrivacyPolicyUrl !== undefined && rawPrivacyPolicyUrl !== null && rawPrivacyPolicyUrl !== '') {
    try {
      const purl = new URL(rawPrivacyPolicyUrl);
      if (purl.protocol !== 'https:') {
        return NextResponse.json({ error: 'Privacy policy URL must use HTTPS' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Privacy policy URL is not a valid URL' }, { status: 400 });
    }
  }

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

  const updateFields: Record<string, unknown> = {};
  if (name) updateFields.name = name;
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

  let updatedRows: any[];
  if (Object.keys(updateFields).length > 0) {
    const { data, error: updateError } = await supabase
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
    updatedRows = data!;
  } else {
    updatedRows = [space];
  }

  // Only include fields that were actually provided in the request body
  // to prevent partial saves (e.g., notifications page) from wiping out
  // fields managed by other forms (e.g., phone number from general settings).
  const settingsPayload: Record<string, unknown> = {
    id: crypto.randomUUID(),
    spaceId: space.id,
  };
  if (typeof notifications === 'boolean') settingsPayload.notifications = notifications;
  if (typeof smsNotifications === 'boolean') settingsPayload.smsNotifications = smsNotifications;
  if (typeof notifyNewLeads === 'boolean') settingsPayload.notifyNewLeads = notifyNewLeads;
  if (typeof notifyTourBookings === 'boolean') settingsPayload.notifyTourBookings = notifyTourBookings;
  if (typeof notifyNewDeals === 'boolean') settingsPayload.notifyNewDeals = notifyNewDeals;
  if (typeof notifyFollowUps === 'boolean') settingsPayload.notifyFollowUps = notifyFollowUps;
  if (phoneNumber !== undefined) settingsPayload.phoneNumber = phoneNumber;
  if (myConnections !== undefined) settingsPayload.myConnections = myConnections;
  if (aiPersonalization !== undefined) settingsPayload.aiPersonalization = aiPersonalization;
  if (billingSettings !== undefined) settingsPayload.billingSettings = billingSettings;
  if (anthropicApiKey !== undefined) settingsPayload.anthropicApiKey = anthropicApiKey || null;
  if (bio !== undefined) settingsPayload.bio = bio;
  if (socialLinks !== undefined) settingsPayload.socialLinks = socialLinks;
  if (logoUrl !== undefined) settingsPayload.logoUrl = logoUrl;
  if (rawPrivacyPolicyUrl !== undefined) settingsPayload.privacyPolicyUrl = rawPrivacyPolicyUrl || null;
  if (consentCheckboxLabel !== undefined) settingsPayload.consentCheckboxLabel = consentCheckboxLabel || null;
  if (privacyPolicyHtml !== undefined) settingsPayload.privacyPolicyHtml = privacyPolicyHtml || null;

  const { error: settingsError } = await supabase
    .from('SpaceSetting')
    .upsert(settingsPayload, { onConflict: 'spaceId' })
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
