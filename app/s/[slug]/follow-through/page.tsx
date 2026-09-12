import { FollowThroughDesk } from '@/components/follow-through/desk';
export default async function FollowThroughPage({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  return <FollowThroughDesk slug={slug} />;
}
