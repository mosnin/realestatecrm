import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { type NextRequest, NextResponse } from 'next/server';
import { rootDomain } from '@/lib/utils';

function extractSubdomain(request: NextRequest): string | null {
  const url = request.url;
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0].toLowerCase().replace(/\.$/, '');

  // Local development environment
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    const fullUrlMatch = url.match(/http:\/\/([^.]+)\.localhost/);
    if (fullUrlMatch && fullUrlMatch[1]) {
      return fullUrlMatch[1];
    }
    if (hostname.includes('.localhost')) {
      return hostname.split('.')[0];
    }
    return null;
  }

  // Production environment
  const rootDomainFormatted = rootDomain.split(':')[0];

  // Always treat any www host as a root-domain alias (never a tenant subdomain)
  if (hostname.startsWith('www.') || hostname === 'www') {
    return null;
  }

  // Handle preview deployment URLs (tenant---branch-name.vercel.app)
  if (hostname.includes('---') && hostname.endsWith('.vercel.app')) {
    const parts = hostname.split('---');
    return parts.length > 0 ? parts[0] : null;
  }

  // Regular subdomain detection
  const isSubdomain =
    hostname !== rootDomainFormatted &&
    hostname !== `www.${rootDomainFormatted}` &&
    hostname.endsWith(`.${rootDomainFormatted}`);

  if (!isSubdomain) return null;

  const candidate = hostname.replace(`.${rootDomainFormatted}`, '');

  if (!candidate || candidate === 'www' || candidate.includes('.')) {
    return null;
  }

  return candidate;
}

// Routes that require authentication when on a subdomain
const isProtectedSubdomainRoute = createRouteMatcher([
  '/s/(.*)'
]);

// Routes that are always public
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/admin(.*)'
]);

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { pathname } = request.nextUrl;
  const subdomain = extractSubdomain(request);

  if (subdomain) {
    // Block access to admin page from subdomains
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Rewrite root and all paths on a subdomain to /s/[subdomain]/...
    if (pathname === '/') {
      // Protect dashboard — require auth
      const { userId } = await auth();
      if (!userId) {
        const signInUrl = new URL('/sign-in', request.url);
        signInUrl.searchParams.set('redirect_url', request.url);
        return NextResponse.redirect(signInUrl);
      }
      return NextResponse.rewrite(new URL(`/s/${subdomain}`, request.url));
    }

    // For other paths on the subdomain, proxy them through /s/[subdomain]
    const rewrittenPath = `/s/${subdomain}${pathname}`;
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL('/sign-in', request.url);
      signInUrl.searchParams.set('redirect_url', request.url);
      return NextResponse.redirect(signInUrl);
    }
    return NextResponse.rewrite(new URL(rewrittenPath, request.url));
  }

  // On root domain: protect /s/* routes, allow everything else
  if (isProtectedSubdomainRoute(request) && !isPublicRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL('/sign-in', request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api|_next|[\\w-]+\\.\\w+).*)'
  ]
};
