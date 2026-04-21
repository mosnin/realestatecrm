import { redirect } from 'next/navigation';

export default async function IntakeAnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/s/${slug}/analytics/form-traffic`);
}
