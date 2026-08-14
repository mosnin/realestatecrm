import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { ReviewsClient, type ReviewRow } from './reviews-client';
import { TITLE_FONT, BODY_MUTED, SECTION_LABEL } from '@/lib/typography';
import { AnimatedNumber } from '@/components/motion';

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
  // Audit-driven addition: pull status too and hard-stop offboarded users.
  // requireAuth (used by API routes) enforces the same gate; server-only
  // pages went through auth() directly and missed it.
  const { data: dbUser } = await supabase
    .from('User')
    .select('id, status')
    .eq('clerkId', clerkId)
    .maybeSingle();

  if (!dbUser) redirect('/setup');
  if ((dbUser as { status?: string }).status === 'offboarded') redirect('/offboarded');
  const userId = (dbUser as { id: string }).id;

  // Non-brokerage space: there are no reviews possible. Render an empty list
  // rather than 404 — the user might visit this link from stale nav.
  if (!space.brokerageId) {
    return (
      <div className="chippi-dashboard-canvas mx-auto max-w-5xl space-y-8 pb-12 pt-3 sm:pt-5" data-page-family="broker-review-room">
        <header className="border-b border-border/60 pb-9">
          <p className={SECTION_LABEL}>Broker review room</p>
          <h1 className="mt-3 max-w-3xl text-[3rem] leading-[.96] tracking-[-0.045em] sm:text-[4.5rem]" style={TITLE_FONT}>
            Get a second set of eyes before risk becomes rework.
          </h1>
          <p className={`${BODY_MUTED} mt-3`}>Connect a brokerage to request and track deal reviews here.</p>
        </header>
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

  const openCount = initialReviews.filter((r) => r.status === 'open').length;

  return (
    <div className="chippi-dashboard-canvas mx-auto max-w-5xl space-y-8 pb-12 pt-3 sm:pt-5" data-page-family="broker-review-room">
      <header className="grid gap-8 border-b border-border/60 pb-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end lg:gap-16">
        <div className="space-y-3">
          <p className={SECTION_LABEL}>Broker review room</p>
          <h1 className="max-w-3xl text-[3rem] leading-[.96] tracking-[-0.045em] sm:text-[4.5rem]" style={TITLE_FONT}>
            Clear the question. Keep the deal moving.
          </h1>
          <p className={BODY_MUTED}>Every flagged decision, broker note, and resolution stays attached to its deal.</p>
        </div>
        <div className="flex items-end gap-3 lg:justify-end">
          <span className="text-[5.5rem] leading-[.78] tracking-[-0.065em] tabular-nums" style={TITLE_FONT}>
            <AnimatedNumber value={openCount} />
          </span>
          <span className="pb-1.5 text-sm text-muted-foreground">open reviews</span>
        </div>
      </header>
      <ReviewsClient slug={slug} initialReviews={initialReviews} />
    </div>
  );
}
