import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';

function optionalTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || undefined;
}

function optionalHttpUrl(value: unknown, fieldName: string): { ok: true; value?: string } | { ok: false; error: string } {
  const url = optionalTrimmedString(value, 500);
  if (!url) return { ok: true };
  if (!/^https?:\/\/.+/i.test(url)) {
    return { ok: false, error: `${fieldName} must start with http:// or https://` };
  }
  return { ok: true, value: url };
}

/**
 * POST /api/broker/create
 * Self-serve brokerage creation. Any authenticated, onboarded realtor can create
 * one brokerage. Enforced by the UNIQUE index on Brokerage.ownerId.
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 3 attempts per user per day
  const { allowed } = await checkRateLimit(`broker:create:${clerkId}`, 3, 86400);
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again tomorrow.' }, { status: 429 });

  const bodyResult = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!bodyResult.ok) return bodyResult.response;

  const body = bodyResult.data as Record<string, unknown>;

  const { name, logoUrl, websiteUrl, officeAddress, officePhone, agentCount, brokerageType, primaryMarket, commissionStructure, geographicCoverage } = body as {
    name?: string;
    logoUrl?: string;
    websiteUrl?: string;
    officeAddress?: string;
    officePhone?: string;
    agentCount?: string;
    brokerageType?: string;
    primaryMarket?: string;
    commissionStructure?: string;
    geographicCoverage?: string;
  };

  const trimmedName = (typeof name === 'string' ? name : '').trim();
  if (!trimmedName || trimmedName.length > 120) {
    return NextResponse.json({ error: 'Brokerage name required (max 120 chars)' }, { status: 400 });
  }

  const normalizedLogoUrl = optionalHttpUrl(logoUrl, 'logoUrl');
  if (!normalizedLogoUrl.ok) {
    return NextResponse.json({ error: normalizedLogoUrl.error }, { status: 400 });
  }
  const normalizedWebsiteUrl = optionalHttpUrl(websiteUrl, 'websiteUrl');
  if (!normalizedWebsiteUrl.ok) {
    return NextResponse.json({ error: normalizedWebsiteUrl.error }, { status: 400 });
  }
  const normalizedOfficeAddress = optionalTrimmedString(officeAddress, 500);
  const normalizedOfficePhone = optionalTrimmedString(officePhone, 40);
  const normalizedAgentCount = optionalTrimmedString(agentCount, 20);
  const normalizedGeographicCoverage = optionalTrimmedString(geographicCoverage, 500);

  // Validate enum fields
  const validBrokerageTypes = ['independent', 'franchise', 'virtual'];
  const validMarkets = ['residential_rental', 'commercial', 'mixed'];
  const validCommissions = ['flat_fee', 'percentage_split', 'hybrid'];
  if (brokerageType && !validBrokerageTypes.includes(brokerageType)) {
    return NextResponse.json({ error: `Invalid brokerageType. Must be one of: ${validBrokerageTypes.join(', ')}` }, { status: 400 });
  }
  if (primaryMarket && !validMarkets.includes(primaryMarket)) {
    return NextResponse.json({ error: `Invalid primaryMarket. Must be one of: ${validMarkets.join(', ')}` }, { status: 400 });
  }
  if (commissionStructure && !validCommissions.includes(commissionStructure)) {
    return NextResponse.json({ error: `Invalid commissionStructure. Must be one of: ${validCommissions.join(', ')}` }, { status: 400 });
  }

  // Resolve internal user id
  const { data: user, error: userErr } = await supabase
    .from('User')
    .select('id, onboard, accountType, platformRole')
    .eq('clerkId', clerkId)
    .maybeSingle();
  if (userErr || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Platform admins bypass the onboarding/account-type gates below. An admin is
  // usually a realtor who was promoted, so their accountType is 'realtor' — which
  // was tripping the "upgrade to a broker account" 403 and blocking them from
  // creating brokerages at all. Admins are superusers; let them through.
  const isAdmin = user.platformRole === 'admin';

  // Broker-only users are marked onboard during setup even without a Space
  if (!user.onboard && !isAdmin) return NextResponse.json({ error: 'Complete onboarding first' }, { status: 403 });
  // Only users who selected broker role during onboarding can create a brokerage
  if (user.accountType === 'realtor' && !isAdmin) {
    return NextResponse.json({ error: 'Upgrade to a broker account to create a brokerage' }, { status: 403 });
  }

  // Check: does this user already own a brokerage?
  const { data: existing } = await supabase
    .from('Brokerage')
    .select('id')
    .eq('ownerId', user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: 'You already own a brokerage' }, { status: 409 });

  // Direct inserts instead of RPC — avoids ambiguous function overload issues
  // when multiple versions of create_brokerage_with_owner exist in the database.
  const brokerageId = crypto.randomUUID();

  const { data: brokerage, error: insertErr } = await supabase
    .from('Brokerage')
    .insert({
      id: brokerageId,
      name: trimmedName,
      ownerId: user.id,
      ...(normalizedLogoUrl.value && { logoUrl: normalizedLogoUrl.value }),
      ...(normalizedWebsiteUrl.value && { websiteUrl: normalizedWebsiteUrl.value }),
      ...(normalizedOfficeAddress && { officeAddress: normalizedOfficeAddress }),
      ...(normalizedOfficePhone && { officePhone: normalizedOfficePhone }),
      ...(normalizedAgentCount && { agentCount: normalizedAgentCount }),
      ...(brokerageType && { brokerageType }),
      ...(primaryMarket && { primaryMarket }),
      ...(commissionStructure && { commissionStructure }),
      ...(normalizedGeographicCoverage && { geographicCoverage: normalizedGeographicCoverage }),
    })
    .select()
    .single();

  if (insertErr) {
    // Check if user already owns a brokerage (race condition with unique index)
    const errMsg = insertErr.message || '';
    if (errMsg.includes('duplicate key') || errMsg.includes('unique') || insertErr.code === '23505') {
      return NextResponse.json({ error: 'You already own a brokerage' }, { status: 409 });
    }
    console.error('[broker/create] Brokerage insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create brokerage' }, { status: 500 });
  }

  // Create the owner membership
  const { error: membershipErr } = await supabase
    .from('BrokerageMembership')
    .insert({
      id: crypto.randomUUID(),
      brokerageId,
      userId: user.id,
      role: 'broker_owner',
    });

  if (membershipErr) {
    console.error('[broker/create] BrokerageMembership insert failed:', membershipErr);
    // Rollback: delete the brokerage we just created since it's unusable without an owner membership
    await supabase.from('Brokerage').delete().eq('id', brokerageId);
    return NextResponse.json({ error: 'Failed to create brokerage membership' }, { status: 500 });
  }

  void audit({ actorClerkId: clerkId, action: 'CREATE', resource: 'Brokerage', resourceId: brokerageId, metadata: { name: trimmedName } });

  return NextResponse.json({ brokerage }, { status: 201 });
}
