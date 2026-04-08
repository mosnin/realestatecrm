import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { supabase } from '@/lib/supabase';
import {
  analyzeFormPerformance,
  generateOptimizationSuggestions,
  getCachedSuggestions,
  setCachedSuggestions,
} from '@/lib/form-optimization';
import type { IntakeFormConfig } from '@/lib/types';

const MIN_SUBMISSIONS = 10;

/**
 * POST /api/form-config/optimize
 *
 * Analyzes submission data and scoring patterns for a space's intake form
 * and returns optimization suggestions (deterministic + AI-powered).
 *
 * Body: { slug: string; skipCache?: boolean }
 * Rate limit: 5 calls per hour per space
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = body.slug as string | undefined;
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Rate limit: 5 calls per hour per space (AI calls are expensive)
  const { allowed } = await checkRateLimit(
    `form-optimize:${space.id}`,
    5,
    3600,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Optimization suggestions can be refreshed up to 5 times per hour.' },
      { status: 429, headers: { 'Retry-After': '3600' } },
    );
  }

  // Check cache (unless explicitly asked to skip)
  const skipCache = body.skipCache === true;
  if (!skipCache) {
    const cached = getCachedSuggestions(space.id);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    // Fetch current form config
    const { data: settings } = await supabase
      .from('SpaceSetting')
      .select('formConfig')
      .eq('spaceId', space.id)
      .maybeSingle();

    const formConfig = settings?.formConfig as IntakeFormConfig | null;
    if (!formConfig?.sections?.length) {
      return NextResponse.json(
        { error: 'No custom form configured. Set up a form in the form builder first.' },
        { status: 400 },
      );
    }

    // Analyze form performance
    const performance = await analyzeFormPerformance(space.id);

    if (performance.totalSubmissions < MIN_SUBMISSIONS) {
      return NextResponse.json({
        performance,
        suggestions: [],
        generatedAt: new Date().toISOString(),
        message: `Not enough data yet. We need at least ${MIN_SUBMISSIONS} submissions to generate suggestions (currently ${performance.totalSubmissions}).`,
      });
    }

    // Generate suggestions (deterministic + AI)
    const suggestions = await generateOptimizationSuggestions(performance, formConfig);

    const result = {
      performance,
      suggestions,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 1 hour
    setCachedSuggestions(space.id, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[form-config/optimize] failed', error);
    return NextResponse.json(
      { error: 'Failed to generate optimization suggestions.' },
      { status: 500 },
    );
  }
}
