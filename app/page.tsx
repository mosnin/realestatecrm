import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { SubdomainForm } from './subdomain-form';
import { rootDomain, protocol } from '@/lib/utils';
import { getSpaceByOwnerId } from '@/lib/space';
import { db } from '@/lib/db';

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    try {
      const user = await db.user.findUnique({ where: { clerkId: userId } });
      if (user) {
        const space = await getSpaceByOwnerId(user.id);
        if (space) {
          redirect(`${protocol}://${space.subdomain}.${rootDomain}`);
        }
      }
    } catch {
      // DB unavailable — render the form anyway
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4 relative">
      <div className="absolute top-4 right-4 flex gap-4">
        {userId ? (
          <Link
            href="/admin"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Admin
          </Link>
        ) : (
          <>
            <Link
              href="/sign-in"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              Get started
            </Link>
          </>
        )}
      </div>

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">
            Real Estate CRM
          </h1>
          <p className="mt-3 text-lg text-gray-600">
            Create your CRM space with a custom subdomain
          </p>
        </div>

        <div className="mt-8 bg-white shadow-md rounded-lg p-6">
          {userId ? (
            <SubdomainForm />
          ) : (
            <div className="text-center space-y-4">
              <p className="text-gray-600">Sign in to create your CRM space.</p>
              <Link
                href="/sign-up"
                className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Create your space
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
