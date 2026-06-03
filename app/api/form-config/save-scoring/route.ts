import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import type { ScoringModel } from '@/lib/scoring/scoring-model-types';

/**
 * Shape validation for a persisted scoring model.
 *
 * The deterministic scorer reads this stored JSON at runtime, so the nested
 * `optionScores` and `ranges` sub-objects must be schema-validated — not just
 * the top-level `weights` object. Bounds mirror the generator's contract
 * (lib/scoring/generate-scoring-model.ts + scoring-model-types.ts): scores and
 * points are 0-100, range bounds are finite numbers (max may be null for an
 * unlimited upper bound). Kept local to this endpoint per task scope.
 */
const score0to100 = z.number().min(0).max(100);

const numberRangeSchema = z
  .object({
    min: z.number().finite(),
    max: z.number().finite().nullable(),
    points: score0to100,
    label: z.string().max(200).optional(),
  })
  .strict();

const questionScoringModelSchema = z
  .object({
    weight: z.number().min(0).max(100),
    optionScores: z.record(z.string(), score0to100).optional(),
    ranges: z.array(numberRangeSchema).optional(),
  })
  .strict();

const scoringModelSchema = z
  .object({
    weights: z.record(z.string(), questionScoringModelSchema),
    totalWeight: z.number(),
    reasoning: z.string().max(2000),
    generatedAt: z.string(),
    leadType: z.enum(['rental', 'buyer']),
  })
  .strict();

/**
 * PUT /api/form-config/save-scoring
 *
 * Persists a manually-adjusted scoring model to SpaceSetting.
 *
 * Body: { slug, leadType: 'rental' | 'buyer', scoringModel: ScoringModel }
 * Returns: { success: true }
 */
export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug as string | undefined;
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const leadType = body.leadType as string | undefined;
  if (!leadType || (leadType !== 'rental' && leadType !== 'buyer')) {
    return NextResponse.json(
      { error: 'leadType must be "rental" or "buyer"' },
      { status: 400 },
    );
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { userId, space } = auth;

  // Rate limit: 20 saves per hour per user
  const { allowed } = await checkRateLimit(
    `save-scoring:${userId}`,
    20,
    3600,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many scoring saves. Try again in a bit.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Schema-validate the full scoring model, including the nested
  // `optionScores` and `ranges` sub-objects the deterministic scorer reads.
  const parsedModel = scoringModelSchema.safeParse(body.scoringModel);
  if (!parsedModel.success) {
    const first = parsedModel.error.issues[0];
    const path = first?.path?.length ? first.path.join('.') : 'scoringModel';
    return NextResponse.json(
      { error: `Invalid scoring model: ${path} ${first?.message ?? 'is malformed'}` },
      { status: 400 },
    );
  }
  const scoringModel: ScoringModel = parsedModel.data as ScoringModel;

  // Validate weights sum to ~100 (allow small rounding margin)
  const totalWeight = Object.values(scoringModel.weights).reduce(
    (sum, w) => sum + (w.weight || 0),
    0,
  );
  if (totalWeight < 95 || totalWeight > 105) {
    return NextResponse.json(
      { error: `Weights must sum to approximately 100 (got ${totalWeight})` },
      { status: 400 },
    );
  }

  const column =
    leadType === 'rental' ? 'rentalScoringModel' : 'buyerScoringModel';

  const { error: updateErr } = await supabase
    .from('SpaceSetting')
    .update({ [column]: scoringModel })
    .eq('spaceId', space.id);

  if (updateErr) {
    console.error('[save-scoring] Failed to save scoring model', updateErr);
    return NextResponse.json(
      { error: 'Failed to save scoring model' },
      { status: 500 },
    );
  }

  void audit({
    actorClerkId: userId,
    action: 'UPDATE',
    resource: 'SpaceSetting',
    resourceId: space.id,
    spaceId: space.id,
    metadata: {
      field: column,
      leadType,
      questionCount: Object.keys(scoringModel.weights).length,
      source: 'manual',
    },
  });

  return NextResponse.json({ success: true });
}
