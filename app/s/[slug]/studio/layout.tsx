import { redirect } from 'next/navigation';
import { isStudioEnabled } from '@/lib/chippi/studio-flag';

export default async function StudioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  if (!isStudioEnabled()) {
    const { slug } = await params;
    redirect(`/s/${slug}/chippi`);
  }
  return children;
}
