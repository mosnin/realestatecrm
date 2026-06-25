/**
 * `research_area` — Property IQ. Research the neighborhood / market for a place
 * (or a property's address) and return a grounded Area IQ brief: schools,
 * safety, walkability, the local market, lifestyle, with sources.
 *
 * Read-only from the realtor's perspective, but it DOES write an AreaReport
 * cache row (research is expensive and reused across every property in the
 * area). The realtor approves nothing — it's a lookup that happens to memoize.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { defineTool } from '../types';
import { normalizeArea, parseAreaQuery, type NormalizedArea } from '@/lib/areas';
import { getOrCreateAreaReport } from '@/lib/area-report-store';
import { tailorVerdict } from '@/lib/area-analysis';
import { toAreaCardData, summariseArea, type AreaCardData } from '@/lib/area-card';

const parameters = z
  .object({
    location: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe('The area to research: a ZIP, "City, ST", or a full address (street is ignored).'),
    propertyId: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .optional()
      .describe("A property's id — researches the area around that property's address."),
    forBuyer: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .optional()
      .describe(
        "Who the area is for, so the verdict is tailored to them. A short description of the buyer and what they care about, e.g. \"family with two kids, budget 600k, wants good schools\". Pass this whenever you know the buyer.",
      ),
  })
  .refine((v) => v.location || v.propertyId, {
    message: 'Provide a location or a propertyId.',
  })
  .describe('Research the neighborhood and local market for an area or a property, tailored to a buyer when known.');

type ResearchAreaData =
  | { ok: true; area: AreaCardData }
  | { ok: false };

async function areaFromProperty(
  spaceId: string,
  propertyId: string,
): Promise<NormalizedArea | null> {
  const { data } = await supabase
    .from('Property')
    .select('city, "stateRegion", "postalCode"')
    .eq('id', propertyId)
    .or(`spaceId.eq.${spaceId},assignedSpaceId.eq.${spaceId}`)
    .maybeSingle();
  if (!data) return null;
  return normalizeArea(data as { city: string | null; stateRegion: string | null; postalCode: string | null });
}

export const researchAreaTool = defineTool<typeof parameters, ResearchAreaData>({
  name: 'research_area',
  riskLevel: 'safe',
  description:
    'Research the neighborhood and local market for an area (ZIP / city / address) or a property: schools, safety, walkability, prices, lifestyle. Returns a grounded Area IQ card with sources.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    let area: NormalizedArea | null = null;
    if (args.propertyId) {
      area = await areaFromProperty(ctx.space.id, args.propertyId);
      if (!area) {
        return {
          summary:
            "I couldn't find that property, or it has no city/state/ZIP yet to research the area.",
          display: 'plain',
        };
      }
    } else if (args.location) {
      area = parseAreaQuery(args.location);
    }

    if (!area) {
      return {
        summary:
          'I need a clearer location to research. Give me a ZIP, or a city and state (e.g. "Austin, TX").',
        display: 'plain',
      };
    }

    const outcome = await getOrCreateAreaReport(ctx.space.id, area);

    if (outcome.status === 'not_configured') {
      return {
        summary:
          'Area research is not configured on this workspace yet (missing web-research API keys).',
        display: 'warning',
        data: { ok: false },
      };
    }
    if (outcome.status === 'no_evidence') {
      return {
        summary: `I researched ${area.label} but couldn't find enough public data to brief you on it.`,
        display: 'plain',
        data: { ok: false },
      };
    }
    if (outcome.status === 'error') {
      return { summary: outcome.message, display: 'error', data: { ok: false } };
    }

    // Tailor the verdict to the buyer when we know who it's for, using the
    // already-researched data (no extra web work; the cached report stays neutral).
    const verdict = args.forBuyer
      ? await tailorVerdict(outcome.report.intelligence, args.forBuyer)
      : outcome.report.intelligence.verdict;

    const card = toAreaCardData(outcome.report, outcome.cached, verdict);
    return {
      summary: summariseArea(outcome.report, verdict),
      data: { ok: true, area: card },
      display: 'area',
    };
  },
});
