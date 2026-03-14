import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/s/(.*)',
  '/setup(.*)',
  '/admin(.*)',
  '/broker(.*)',
  '/invite/(.*)',
  '/join/(.*)',
]);

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
]);

const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)'
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request) && !isPublicRoute(request)) {
    const session = await auth();
    if (!session.userId) {
      const signInUrl = new URL('/sign-in', request.url);
      signInUrl.searchParams.set('redirect_url', request.url);
      return NextResponse.redirect(signInUrl);
    }

    // Admin route protection: require role=admin in publicMetadata
    if (isAdminRoute(request)) {
      const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
      if (metadata.role !== 'admin') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
