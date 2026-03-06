'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { rootDomain, protocol } from '@/lib/utils';

export default function NotFound() {
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // Extract subdomain from URL if we're on a subdomain page
    if (pathname?.startsWith('/s/')) {
      const extractedSubdomain = pathname.split('/')[2];
      if (extractedSubdomain) {
        setSubdomain(extractedSubdomain);
      }
    } else {
      // Try to extract from hostname for direct subdomain access
      const hostname = window.location.hostname;
      if (hostname.includes(`.${rootDomain.split(':')[0]}`)) {
        const extractedSubdomain = hostname.split('.')[0];
        setSubdomain(extractedSubdomain);
      }
    }
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-white">
          {subdomain ? (
            <>
              <span className="text-neutral-400">{subdomain}</span>.{rootDomain}{' '}
              doesn&apos;t exist
            </>
          ) : (
            'Page Not Found'
          )}
        </h1>
        <p className="mt-3 text-lg text-neutral-500">
          {subdomain
            ? "This workspace hasn't been created yet."
            : "The page you're looking for doesn't exist."}
        </p>
        <div className="mt-6">
          <Link
            href={`${protocol}://${rootDomain}`}
            className="rounded-full bg-white text-black px-6 py-2.5 text-sm font-medium hover:bg-neutral-200 transition-colors"
          >
            {subdomain ? `Create ${subdomain}` : `Go to ${rootDomain}`}
          </Link>
        </div>
      </div>
    </div>
  );
}
