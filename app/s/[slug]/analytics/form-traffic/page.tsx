import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { FormAnalytics } from '@/components/analytics/form-analytics';

export default async function FormTrafficAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Form Traffic</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Completion funnel, drop-off analysis, and form performance metrics
        </p>
      </div>
      <FormAnalytics slug={slug} />
    </div>
  );
}
