import { NextRequest, NextResponse } from 'next/server';
import { requireBroker, canEditSettings } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { formConfigSchema } from '@/lib/form-config-schema';
import { auth } from '@clerk/nextjs/server';

/**
 * GET /api/broker/form-config
 * Returns the brokerage's brokerageFormConfig from the Brokerage table.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the brokerageFormConfig field from the Brokerage row
  const { data: brokerage, error } = await supabase
    .from('Brokerage')
    .select('id, brokerageFormConfig')
    .eq('id', ctx.brokerage.id)
    .maybeSingle();

  if (error) {
    console.error('[broker/form-config] fetch failed', error);
    return NextResponse.json({ error: 'Failed to fetch form config' }, { status: 500 });
  }

  return NextResponse.json({
    brokerageId: ctx.brokerage.id,
    formConfig: brokerage?.brokerageFormConfig ?? null,
  });
}

/**
 * PUT /api/broker/form-config
 * Validate and save a brokerage-level form config.
 * Requires broker access + settings edit permission.
 */
export async function PUT(req: NextRequest) {
  const { userId: clerkId } = await auth();

  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!canEditSettings(ctx.membership.role)) {
    return NextResponse.json(
      { error: 'Only the owner or admins can update form config' },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate the form config
  const parsed = formConfigSchema.safeParse(body.formConfig);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid form config', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const formConfig = parsed.data;

  const { error: updateErr } = await supabase
    .from('Brokerage')
    .update({ brokerageFormConfig: formConfig })
    .eq('id', ctx.brokerage.id);

  if (updateErr) {
    console.error('[broker/form-config] update failed', updateErr);
    return NextResponse.json({ error: 'Failed to save form config' }, { status: 500 });
  }

  void audit({
    actorClerkId: clerkId ?? null,
    action: 'UPDATE',
    resource: 'Brokerage',
    resourceId: ctx.brokerage.id,
    metadata: {
      field: 'brokerageFormConfig',
      sectionCount: formConfig.sections.length,
    },
  });

  return NextResponse.json({
    brokerageId: ctx.brokerage.id,
    formConfig,
  });
}
