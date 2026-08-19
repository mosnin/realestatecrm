'use client';

/**
 * Renders a `display: 'deals'` tool result as the tool-ui DataTable.
 *
 * Deal-producing tools return one of two shapes: `{ deals: [...] }`
 * (find_stuck_deals, list views) or `{ match, deal }` / `{ match, deals }`
 * (find_deal). The dispatch normalizes to a `deals` array before handing it
 * here; we map, validate, and fall back to null on a malformed payload.
 */

import { DataTable } from '@/components/tool-ui/data-table';
import { safeParseSerializableDataTable } from '@/components/tool-ui/data-table/schema';
import { formatCurrency } from '@/lib/formatting';
import { CompactResultList } from './compact-result-list';
import { buildDealsTable, type DealRowInput } from './tool-ui-mappers';

export function DealsTableResult({ deals }: { deals: DealRowInput[] }) {
  if (!deals?.length) return null;
  const payload = buildDealsTable(deals);
  const parsed = safeParseSerializableDataTable(payload);
  if (!parsed) return null;
  return (
    <CompactResultList
      noun="deal"
      items={deals.map((deal) => ({
        id: deal.id,
        title: deal.title,
        subtitle: [
          deal.stageName,
          typeof deal.value === 'number' ? formatCurrency(deal.value) : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      }))}
    >
      <div className="mt-2 md:mt-0">
        <DataTable {...parsed} />
      </div>
    </CompactResultList>
  );
}
