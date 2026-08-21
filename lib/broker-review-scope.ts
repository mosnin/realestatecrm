import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';


export type BrokerageReviewDeal = {
  deal: {
    id: string;
    title: string | null;
    value: number | null;
    spaceId: string;
  };
  space: {
    id: string;
    slug: string | null;
    ownerId: string | null;
    brokerageId: string | null;
  };
};

/**
 * Resolve a deal referenced by a broker review and prove the deal's space is
 * inside the review's brokerage before callers display it or notify that space.
 */
export async function loadBrokerageScopedReviewDeal(params: {
  dealId: string;
  brokerageId: string;
}): Promise<BrokerageReviewDeal | null> {
  const { dealId, brokerageId } = params;

  const { data: deal, error: dealError } = await unscoped(supabase
    .from('Deal'), 'broker: membership-proved cross-space access')
    .select('id, title, value, spaceId')
    .eq('id', dealId)
    .maybeSingle<BrokerageReviewDeal['deal']>();
  if (dealError) throw dealError;
  if (!deal?.spaceId) return null;

  const { data: space, error: spaceError } = await supabase
    .from('Space')
    .select('id, slug, ownerId, brokerageId')
    .eq('id', deal.spaceId)
    .maybeSingle<BrokerageReviewDeal['space']>();
  if (spaceError) throw spaceError;
  if (!space) return null;

  if (space.brokerageId === brokerageId) return { deal, space };
  if (!space.ownerId) return null;

  const { data: membership, error: membershipError } = await supabase
    .from('BrokerageMembership')
    .select('id')
    .eq('brokerageId', brokerageId)
    .eq('userId', space.ownerId)
    .maybeSingle<{ id: string }>();
  if (membershipError) throw membershipError;

  return membership ? { deal, space } : null;
}
