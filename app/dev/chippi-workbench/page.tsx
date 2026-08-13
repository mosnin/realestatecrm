import { notFound } from 'next/navigation';
import { LiveWorkbench } from '@/components/chippi/live-workbench';
import { DEMO_PIPELINE_ARTIFACT } from '@/lib/chippi/workbench';

/**
 * Development-only product review route. It deliberately uses fixture data and
 * never calls Supabase or a production service. `?state=empty` and
 * `?state=error` make the honest non-happy paths reviewable as well.
 */
export default async function ChippiWorkbenchPreview({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { state } = await searchParams;
  const displayState = state === 'empty' || state === 'error' ? state : 'ready';

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto h-[min(48rem,calc(100vh-4rem))] max-w-5xl overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_20px_60px_rgb(0_0_0_/_0.08)]">
        <LiveWorkbench artifact={DEMO_PIPELINE_ARTIFACT} state={displayState} />
      </div>
    </main>
  );
}
