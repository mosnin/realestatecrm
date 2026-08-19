'use client';

/**
 * Renders a `display: 'properties'` tool result as the tool-ui ItemCarousel.
 *
 * Interactivity reuses the SAME intent channel the availability picker uses:
 * `onUserIntent` (forwarded by chippi-workspace as the realtor's next
 * message). When present, each card gets a "View" action and clicking a card
 * or its action asks Chippi to pull that property up — which lands on the
 * normal find_property flow, no new endpoint, no permission bypass. When
 * `onUserIntent` is absent (read-only history surfaces), the carousel renders
 * without actions and cards are inert.
 */

import { ItemCarousel } from '@/components/tool-ui/item-carousel';
import { safeParseSerializableItemCarousel } from '@/components/tool-ui/item-carousel/schema';
import { formatCurrency } from '@/lib/formatting';
import { CompactResultList } from './compact-result-list';
import { buildPropertiesCarousel, type PropertyItemInput } from './tool-ui-mappers';

export function PropertiesCarouselResult({
  properties,
  onUserIntent,
}: {
  properties: PropertyItemInput[];
  onUserIntent?: (text: string) => void;
}) {
  if (!properties?.length) return null;

  const interactive = Boolean(onUserIntent);
  const payload = buildPropertiesCarousel(properties, { withActions: interactive });
  const parsed = safeParseSerializableItemCarousel(payload);
  if (!parsed) return null;

  // Look up the address by id so the prompt names the property the realtor
  // tapped (the carousel callbacks carry only ids).
  const addressById = new Map(properties.map((p) => [p.id, p.address]));
  const ask = (itemId: string) => {
    if (!onUserIntent) return;
    const address = addressById.get(itemId);
    onUserIntent(
      address ? `Show me the details for ${address}` : `Show me property ${itemId}`,
    );
  };

  return (
    <CompactResultList
      noun="property"
      plural="properties"
      onItemClick={interactive ? ask : undefined}
      items={properties.map((property) => ({
        id: property.id,
        title: property.address,
        subtitle:
          typeof (property.listPrice ?? property.price) === 'number'
            ? formatCurrency((property.listPrice ?? property.price) as number)
            : undefined,
      }))}
    >
      <div className="mt-2 md:mt-0">
        <ItemCarousel
          {...parsed}
          onItemClick={interactive ? ask : undefined}
          onItemAction={interactive ? (itemId) => ask(itemId) : undefined}
        />
      </div>
    </CompactResultList>
  );
}
