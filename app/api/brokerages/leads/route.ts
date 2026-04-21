import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { requireBroker, canManageLeads } from '@/lib/permissions';
import { getSpaceByOwnerId } from '@/lib/space';

const addLeadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  lastName: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().email('Invalid email address').max(255),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  leadType: z.enum(['rental', 'buyer']),
  budget: z.coerce.number().positive().optional().nullable(),
  notes: z.string().trim().max(4000).optional().or(z.literal('')),
});

/**
 * POST /api/brokerages/leads
 *
 * Manually add a single lead to the current broker's space.
 * Auth: broker_owner or broker_admin only.
 */
export async function POST(req: NextRequest) {
  // ── Auth: require broker_owner or broker_admin ───────────────────────────
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canManageLeads(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only the owner or admins can add leads' },
      { status: 403 },
    );
  }

  const { brokerage } = ctx;

  // ── Parse & validate request body ───────────────────────────────────────
  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = addLeadSchema.safeParse(requestBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request data', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { firstName, lastName, email, phone, leadType, budget, notes } = parsed.data;
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  try {
    // ── Find the brokerage owner's space ─────────────────────────────────
    const space = await getSpaceByOwnerId(brokerage.ownerId);
    if (!space) {
      return NextResponse.json(
        { error: 'Brokerage owner does not have a workspace configured.' },
        { status: 500 },
      );
    }

    // ── Insert the Contact record ─────────────────────────────────────────
    const { data: contact, error: insertError } = await supabase
      .from('Contact')
      .insert({
        id: crypto.randomUUID(),
        spaceId: space.id,
        brokerageId: brokerage.id,
        name: fullName,
        email: email || null,
        phone: phone || null,
        budget: budget ?? null,
        notes: notes || null,
        leadType,
        type: 'QUALIFICATION',
        properties: [],
        tags: ['brokerage-lead', 'new-lead'],
        scoringStatus: 'pending',
        scoreLabel: 'unscored',
        sourceLabel: 'brokerage-manual',
      })
      .select('id, name, email, phone, budget, leadType, tags, createdAt, scoreLabel, leadScore, notes')
      .single();

    if (insertError) throw insertError;

    console.info('[brokerages/leads] manual lead created', {
      contactId: contact.id,
      spaceId: space.id,
      brokerageId: brokerage.id,
      leadType,
    });

    return NextResponse.json({ success: true, contact }, { status: 201 });
  } catch (error) {
    console.error('[brokerages/leads] unhandled error', {
      brokerageId: brokerage.id,
      error,
    });
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
