'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { rootDomain, protocol } from '@/lib/utils';

export default function NotFound() {
  const [slug, setSlug] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/s/')) {
      const extractedSlug = pathname.split('/')[2];
      if (extractedSlug) setSlug(extractedSlug);
    }
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          {slug ? (
            <>
              Workspace <span className="text-muted-foreground">{slug}</span> doesn&apos;t exist
            </>
          ) : (
            'Page Not Found'
          )}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {slug
            ? "This workspace hasn't been created yet."
            : "The page you're looking for doesn't exist."}
        </p>
        <div className="mt-6">
          <Link
            href={`${protocol}://${rootDomain}`}
            className="rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {slug ? `Create ${slug}` : `Go to ${rootDomain}`}
          </Link>
        </div>
      </div>
    </div>
  );
}
