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

// Routes that should NEVER be passed as redirect_url after login.
// Only actual dashboard pages (/s/...) are valid post-login destinations.
const SAFE_REDIRECT_PREFIXES = ['/s/', '/broker', '/admin'];

export default clerkMiddleware(async (auth, request) => {
  const session = await auth();
  const { pathname } = request.nextUrl;

  // `/` → send everyone to the right place immediately.
  if (pathname === '/') {
    if (session.userId) {
      return NextResponse.redirect(new URL('/auth/redirect?intent=realtor', request.url));
    }
    return NextResponse.redirect(new URL('/login/realtor', request.url));
  }

  // Authenticated users on auth pages → send to their dashboard.
  if (session.userId && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/login'))) {
    return NextResponse.redirect(new URL('/auth/redirect?intent=realtor', request.url));
  }

  // Protected routes: must be logged in.
  if (isProtectedRoute(request) && !isPublicRoute(request)) {
    if (!session.userId) {
      // Redirect to login. Only pass redirect_url for safe dashboard pages —
      // never for /setup, /auth/redirect, etc. to avoid Clerk honouring a
      // redirect_url that skips the proper post-signup flow.
      const signInUrl = new URL('/login/realtor', request.url);
      const isSafeRedirect = SAFE_REDIRECT_PREFIXES.some((p) => pathname.startsWith(p));
      if (isSafeRedirect) {
        signInUrl.searchParams.set('redirect_url', request.url);
      }
      return NextResponse.redirect(signInUrl);
    }

    // Admin route protection
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
