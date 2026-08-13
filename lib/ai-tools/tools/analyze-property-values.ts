/**
 * Grounded property-value analysis backed by the existing CMA engine.
 *
 * An address is structurally required. That prevents the agent from turning a
 * vague request for "nearby values" into invented comps or a guessed price.
 * buildCma uses RentCast when configured and labels its CRM-only fallback.
 */

import { z } from 'zod';
import { buildCma, DATA_SOURCE_LABEL } from '@/lib/cma';
import { defineTool } from '../types';
import { buildChippiInsightProgram } from '@/lib/openui/chippi-programs';

const parameters = z
  .object({
    address: z
      .string()
      .trim()
      .min(5)
      .max(500)
      .describe('The subject property street address. Required. Never infer or invent it.'),
    city: z.string().trim().max(120).optional(),
    stateRegion: z.string().trim().max(120).optional(),
    beds: z.number().int().min(0).max(30).optional(),
    baths: z.number().min(0).max(30).optional(),
    squareFeet: z.number().int().positive().max(1_000_000).optional(),
    propertyType: z.string().trim().max(100).optional(),
    listPrice: z.number().positive().max(1_000_000_000).optional(),
  })
  .describe(
    'Analyze a specific property using grounded RentCast market data when configured, with clearly labeled CRM-only fallback data.',
  );

interface PropertyValueInsightPayload {
  program: string;
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export const analyzePropertyValuesTool = defineTool<typeof parameters, PropertyValueInsightPayload | Record<string, unknown>>({
  name: 'analyze_property_values',
  riskLevel: 'safe',
  description:
    'Build a grounded valuation for one known address from RentCast market data when available, otherwise clearly labeled saved CRM comps. If the address is missing, ask for it. Never invent prices or comparables.',
  parameters,
  requiresApproval: false,

  async handler(args, ctx) {
    try {
      const result = await buildCma({
        spaceId: ctx.space.id,
        subjectFields: {
          address: args.address,
          city: args.city,
          stateRegion: args.stateRegion,
          beds: args.beds,
          baths: args.baths,
          squareFeet: args.squareFeet,
          propertyType: args.propertyType,
          listPrice: args.listPrice,
        },
        signal: ctx.signal,
      });

      const source = DATA_SOURCE_LABEL[result.dataSource];
      const location = [result.subject.address, result.subject.city, result.subject.stateRegion]
        .filter(Boolean)
        .join(', ');

      if (result.stats.insufficientData) {
        return {
          summary:
            `There is not enough grounded data to give a defensible value for ${location}. ` +
            `${source} returned ${result.stats.pricedCount} priced comparable${result.stats.pricedCount === 1 ? '' : 's'} and no market estimate. No value was inferred.`,
          modelContext: JSON.stringify({
            source,
            subject: location,
            pricedComparableCount: result.stats.pricedCount,
            insufficientData: true,
            instruction: 'Do not supply, estimate, or infer a property value from this result.',
          }),
          data: {
            id: 'property-value-analysis',
            title: 'Property value analysis',
            description: `${location} | ${source} | insufficient grounded data`,
            stats: [
              {
                key: 'comps',
                label: 'Priced comparables',
                value: result.stats.pricedCount,
                format: { kind: 'number', decimals: 0 },
              },
            ],
          },
          display: 'warning',
        };
      }

      const pointValue = result.stats.estimatedValue ?? result.stats.median;
      const metrics: Array<{ label: string; value: string }> = [];
      if (pointValue != null) {
        metrics.push({
          label: result.stats.estimatedValue != null ? 'Estimated value' : 'Comp median',
          value: money.format(pointValue),
        });
      }
      if (result.stats.suggestedLow != null) {
        metrics.push({
          label: 'Range low',
          value: money.format(result.stats.suggestedLow),
        });
      }
      if (result.stats.suggestedHigh != null) {
        metrics.push({
          label: 'Range high',
          value: money.format(result.stats.suggestedHigh),
        });
      }
      metrics.push({
        label: 'Comparables',
        value: String(result.stats.compCount),
      });

      const range =
        result.stats.suggestedLow != null && result.stats.suggestedHigh != null
          ? `${money.format(result.stats.suggestedLow)} to ${money.format(result.stats.suggestedHigh)}`
          : 'no defensible range available';
      const headline = pointValue != null ? money.format(pointValue) : 'no point estimate';

      return {
        summary:
          `${location}: ${headline}, with a grounded range of ${range}, from ${source} ` +
          `using ${result.stats.compCount} comparable${result.stats.compCount === 1 ? '' : 's'}.`,
        modelContext: JSON.stringify({
          source,
          subject: result.subject,
          stats: result.stats,
          comparables: result.comps.slice(0, 6).map((comp) => ({
            address: comp.address,
            city: comp.city,
            beds: comp.beds,
            baths: comp.baths,
            squareFeet: comp.squareFeet,
            price: comp.price,
            priceBasis: comp.priceBasis,
            distanceMiles: comp.distanceMiles,
            daysOld: comp.daysOld,
            source: comp.source,
          })),
          instruction: 'Use only these grounded figures. Do not add or infer missing prices or comparables.',
        }),
        data: {
          program: buildChippiInsightProgram({
            title: 'Property value analysis',
            summary: location,
            source,
            metrics,
            notes: ['Grounded figures only. Chippi does not infer missing prices or comparables.'],
          }),
        },
        display: 'openui',
      };
    } catch (error) {
      return {
        summary: `Property value analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        display: 'error',
      };
    }
  },
});
