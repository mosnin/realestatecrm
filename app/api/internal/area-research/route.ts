import { NextRequest, NextResponse } from 'next/server';
import { normalizeArea, parseAreaQuery, type NormalizedArea } from '@/lib/areas';
import { getOrCreateAreaReport } from '@/lib/area-report-store';
import { tailorVerdict } from '@/lib/area-analysis';

/**
 * POST /api/internal/area-research — Property IQ research for the Modal agent.
 *
 * The Tavily / Firecrawl / LLM pipeline lives in TypeScript (lib/area-analysis),
 * so the Python agent's `research_area` tool calls back here instead of
 * re-implementing it. Internal-only: authenticated by AGENT_INTERNAL_SECRET (the
 * same shared secret the agent uses for /api/agent/events). The spaceId comes
 * from the agent's RunContext, never the model, so tenancy is preserved.
 *
 * Body: { spaceId, query? | city?,state?,postalCode?, forceRefresh? }.
 */
export const runtime = 'nodejs';
export const maxDuration = 60;

const AGENT_INTERNAL_SECRET = process.env.AGENT_INTERNAL_SECRET ?? '';

interface Body {
  spaceId?: string;
  query?: string;
  city?: string | null;
  stateRegion?: string | null;
  postalCode?: string | null;
  forceRefresh?: boolean;
  /** Optional buyer description — tailors the verdict to them. */
  forBuyer?: string;
}

export async function POST(req: NextRequest) {
  if (!AGENT_INTERNAL_SECRET) {
    console.error('[internal/area-research] AGENT_INTERNAL_SECRET is not configured');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${AGENT_INTERNAL_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.spaceId) {
    return NextResponse.json({ error: 'Missing spaceId' }, { status: 400 });
  }

  let area: NormalizedArea | null = null;
  if (typeof body.query === 'string' && body.query.trim()) {
    area = parseAreaQuery(body.query);
  } else {
    area = normalizeArea({
      city: body.city ?? null,
      stateRegion: body.stateRegion ?? null,
      postalCode: body.postalCode ?? null,
    });
  }
  if (!area) {
    return NextResponse.json(
      { status: 'error', error: 'Could not identify an area to research (need a ZIP or city + state).' },
      { status: 422 },
    );
  }

  const outcome = await getOrCreateAreaReport(area, {
    forceRefresh: Boolean(body.forceRefresh),
  });

  if (outcome.status === 'ok') {
    // Tailor the verdict to the buyer when the agent passed one, using the
    // already-researched data. The shared cached report stays neutral; we only
    // override the verdict on the response.
    if (typeof body.forBuyer === 'string' && body.forBuyer.trim()) {
      const tailored = await tailorVerdict(outcome.report.intelligence, body.forBuyer);
      const report = {
        ...outcome.report,
        intelligence: { ...outcome.report.intelligence, verdict: tailored },
      };
      return NextResponse.json({ status: 'ok', cached: outcome.cached, report });
    }
    return NextResponse.json({ status: 'ok', cached: outcome.cached, report: outcome.report });
  }
  if (outcome.status === 'not_configured') {
    return NextResponse.json({ status: 'not_configured', missing: outcome.missing });
  }
  if (outcome.status === 'no_evidence') {
    return NextResponse.json({ status: 'no_evidence', generatedAt: outcome.generatedAt });
  }
  return NextResponse.json({ status: 'error', error: outcome.message }, { status: 502 });
}
