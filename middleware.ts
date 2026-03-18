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
  '/auth/(.*)',
]);

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/login/(.*)',
]);

const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)'
]);

export default clerkMiddleware(async (auth, request) => {
  const session = await auth();

  // Redirect authenticated users away from /sign-in and /sign-up to home.
  // Home page (/) stays accessible — the OnboardingDialog handles routing
  // to dashboard or showing the workspace creation popup.
  const { pathname } = request.nextUrl;
  if (session.userId && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/login'))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (isProtectedRoute(request) && !isPublicRoute(request)) {
    if (!session.userId) {
      const signInUrl = new URL('/', request.url);
      signInUrl.searchParams.set('redirect_url', request.url);
      return NextResponse.redirect(signInUrl);
    }

    // Admin route protection: require role=admin in publicMetadata
    if (isAdminRoute(request)) {
      const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
      if (metadata.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
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
