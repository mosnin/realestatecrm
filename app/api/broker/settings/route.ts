import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireBroker, canEditSettings } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';

/**
 * GET /api/broker/settings
 * Returns current brokerage settings.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    id: ctx.brokerage.id,
    name: ctx.brokerage.name,
    websiteUrl: ctx.brokerage.websiteUrl,
    logoUrl: ctx.brokerage.logoUrl,
    status: ctx.brokerage.status,
    privacyPolicyHtml: ctx.brokerage.privacyPolicyHtml ?? null,
  });
}

/**
 * PATCH /api/broker/settings
 * Update brokerage settings. Owner or admin can update.
 */
export async function PATCH(req: Request) {
  const { userId: clerkId } = await auth();
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canEditSettings(ctx.membership.role)) {
    return NextResponse.json({ error: 'Only the owner or admins can update settings' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  // Name
  if (typeof body.name === 'string') {
    const name = body.name.trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    updates.name = name;
  }

  // Website URL
  if (body.websiteUrl !== undefined) {
    if (body.websiteUrl === null || body.websiteUrl === '') {
      updates.websiteUrl = null;
    } else if (typeof body.websiteUrl === 'string') {
      const url = body.websiteUrl.trim().slice(0, 500);
      if (url && !/^https?:\/\/.+/i.test(url)) {
        return NextResponse.json({ error: 'Website URL must start with http:// or https://' }, { status: 400 });
      }
      updates.websiteUrl = url || null;
    }
  }

  // Logo URL
  if (body.logoUrl !== undefined) {
    if (body.logoUrl === null || body.logoUrl === '') {
      updates.logoUrl = null;
    } else if (typeof body.logoUrl === 'string') {
      const url = body.logoUrl.trim().slice(0, 500);
      if (url && !/^https?:\/\/.+/i.test(url)) {
        return NextResponse.json({ error: 'Logo URL must start with http:// or https://' }, { status: 400 });
      }
      updates.logoUrl = url || null;
    }
  }

  // Privacy Policy HTML
  if (body.privacyPolicyHtml !== undefined) {
    if (body.privacyPolicyHtml === null || body.privacyPolicyHtml === '') {
      updates.privacyPolicyHtml = null;
    } else if (typeof body.privacyPolicyHtml === 'string') {
      // Cap at 100KB to prevent storage abuse
      updates.privacyPolicyHtml = body.privacyPolicyHtml.slice(0, 100_000);
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateErr } = await supabase
      .from('Brokerage')
      .update(updates)
      .eq('id', ctx.brokerage.id);

    if (updateErr) {
      console.error('[broker/settings] update failed', updateErr);
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
    }
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'Brokerage',
    resourceId: ctx.brokerage.id,
    metadata: { updates },
  });

  return NextResponse.json({ success: true, ...updates });
}
