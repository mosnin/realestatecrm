import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ReviewsClient, type ReviewRow } from './reviews-client';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Server component: fetch the caller's own reviews via supabase directly
// (server components bypass the HTTP layer — same pattern as
// app/broker/reviews/page.tsx). Types mirror the GET list API response.
export default async function RealtorReviewsPage({ params }: PageProps) {
  const { slug } = await params;

  const { userId: clerkId } = await auth();
  if (!clerkId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) {
    notFound();
  }

  // Resolve caller's DB user id. The outer /s/[slug]/layout already gates on
  // space ownership, but we still need the User.id to filter reviews.
  const { data: dbUser } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkId)
    .maybeSingle();

  if (!dbUser) redirect('/setup');
  const userId = (dbUser as { id: string }).id;

  // Non-brokerage space: there are no reviews possible. Render an empty list
  // rather than 404 — the user might visit this link from stale nav.
  if (!space.brokerageId) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My reviews</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deals you&apos;ve flagged for broker review
          </p>
        </div>
        <ReviewsClient slug={slug} initialReviews={[]} />
      </div>
    );
  }

  // 1. Caller's review requests (all statuses — the client tab defaults to
  //    Open but keeps the full list hydrated so switching tabs is instant).
  type RawReview = {
    id: string;
    dealId: string;
    status: string;
    reason: string;
    createdAt: string;
    resolvedAt: string | null;
    resolvedNote: string | null;
  };

  const { data: rawReviews } = await supabase
    .from('DealReviewRequest')
    .select('id, dealId, status, reason, createdAt, resolvedAt, resolvedNote')
    .eq('requestingUserId', userId)
    .eq('brokerageId', space.brokerageId)
    .order('createdAt', { ascending: false })
    .limit(200);

  const reviews = (rawReviews ?? []) as RawReview[];

  const reviewIds = reviews.map((r) => r.id);
  const dealIds = Array.from(new Set(reviews.map((r) => r.dealId).filter(Boolean)));

  // 2. Parallel joins: deals + comment counts. Mirror the broker page shape.
  type DealRow = { id: string; title: string | null; value: number | null };
  type CommentRow = { reviewRequestId: string };

  const [dealsRes, commentsRes] = await Promise.all([
    dealIds.length
      ? supabase.from('Deal').select('id, title, value').in('id', dealIds)
      : Promise.resolve({ data: [] as DealRow[] }),
    reviewIds.length
      ? supabase
          .from('DealReviewComment')
          .select('reviewRequestId')
          .in('reviewRequestId', reviewIds)
      : Promise.resolve({ data: [] as CommentRow[] }),
  ]);

  const dealsData = (dealsRes.data ?? []) as DealRow[];
  const commentsData = (commentsRes.data ?? []) as CommentRow[];

  const dealMap = new Map<string, DealRow>(dealsData.map((d) => [d.id, d]));
  const commentCounts = new Map<string, number>();
  for (const c of commentsData) {
    commentCounts.set(c.reviewRequestId, (commentCounts.get(c.reviewRequestId) ?? 0) + 1);
  }

  const initialReviews: ReviewRow[] = reviews.map((r) => {
    const deal = dealMap.get(r.dealId);
    return {
      id: r.id,
      dealId: r.dealId,
      status: r.status as ReviewRow['status'],
      reason: r.reason,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      resolvedNote: r.resolvedNote,
      deal: {
        id: r.dealId,
        title: deal?.title ?? null,
        value: deal?.value ?? null,
      },
      commentCount: commentCounts.get(r.id) ?? 0,
    };
  });

  // Open first, then createdAt DESC (the query already ordered by createdAt,
  // so this is just a stable re-bucket).
  const STATUS_RANK: Record<ReviewRow['status'], number> = {
    open: 0,
    approved: 1,
    closed: 2,
  };
  initialReviews.sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 99;
    const rb = STATUS_RANK[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My reviews</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Deals you&apos;ve flagged for broker review
        </p>
      </div>
      <ReviewsClient slug={slug} initialReviews={initialReviews} />
    </div>
  );
}
