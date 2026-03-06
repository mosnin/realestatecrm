import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceByOwnerId } from '@/lib/space';
import { SubdomainForm } from '@/app/subdomain-form';

export default async function DashboardRedirectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const user = await db.user.findUnique({ where: { clerkId: userId } });

  if (user) {
    const space = await getSpaceByOwnerId(user.id);
    if (space) {
      redirect(`/s/${space.subdomain}`);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6 flex items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Create your workspace</h1>
          <p className="mt-2 text-gray-600 text-sm">
            You’re signed in. Set up your workspace to continue to your dashboard.
          </p>
        </div>
        <SubdomainForm />
      </div>
    </div>
  );
}
