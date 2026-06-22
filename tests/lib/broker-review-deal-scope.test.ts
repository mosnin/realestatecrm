import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const helper = readFileSync(join(process.cwd(), 'lib/broker-review-scope.ts'), 'utf8');
const reviewListRoute = readFileSync(join(process.cwd(), 'app/api/broker/reviews/route.ts'), 'utf8');
const reviewRoute = readFileSync(join(process.cwd(), 'app/api/broker/reviews/[id]/route.ts'), 'utf8');
const commentsRoute = readFileSync(join(process.cwd(), 'app/api/broker/reviews/[id]/comments/route.ts'), 'utf8');

describe('broker review deal scoping', () => {
  it('proves review deal spaces belong to the review brokerage', () => {
    expect(helper).toContain(".from('Deal')");
    expect(helper).toContain(".eq('id', dealId)");
    expect(helper).toContain(".from('Space')");
    expect(helper).toContain(".eq('id', deal.spaceId)");
    expect(helper).toContain('space.brokerageId === brokerageId');
    expect(helper).toContain(".from('BrokerageMembership')");
    expect(helper).toContain(".eq('brokerageId', brokerageId)");
    expect(helper).toContain(".eq('userId', space.ownerId)");
  });

  it('uses the scoped deal resolver for review list shaping', () => {
    expect(reviewListRoute).toContain("import { loadBrokerageScopedReviewDeal } from '@/lib/broker-review-scope'");
    expect(reviewListRoute).toContain('loadBrokerageScopedReviewDeal({ dealId, brokerageId: ctx.brokerage.id })');
    expect(reviewListRoute).not.toContain("supabase.from('Deal').select('id, title, value, spaceId').in('id', dealIds)");
    expect(reviewListRoute).not.toContain("supabase.from('Space').select('id, slug').in('id', spaceIds)");
  });

  it('uses the scoped deal resolver for review detail shaping and notifications', () => {
    expect(reviewRoute).toContain("import { loadBrokerageScopedReviewDeal } from '@/lib/broker-review-scope'");
    expect(reviewRoute).toContain('loadBrokerageScopedReviewDeal({ dealId: row.dealId, brokerageId: row.brokerageId })');
    expect(reviewRoute).toContain('loadBrokerageScopedReviewDeal({\n        dealId: updated.dealId,\n        brokerageId: updated.brokerageId,');
  });

  it('uses the scoped deal resolver before broker comment push notifications', () => {
    expect(commentsRoute).toContain("import { loadBrokerageScopedReviewDeal } from '@/lib/broker-review-scope'");
    expect(commentsRoute).toContain('loadBrokerageScopedReviewDeal({\n          dealId: review.dealId,\n          brokerageId: review.brokerageId,');
    expect(commentsRoute).toContain('sendPushToSpace(scopedDeal.deal.spaceId');
  });
});
