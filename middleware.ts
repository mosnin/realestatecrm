import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/s/(.*)',
  '/setup(.*)',
  '/admin(.*)',
  '/broker(.*)',
  '/invite/(.*)',
  '/join/(.*)',
  '/auth/(.*)',
  '/authorize',
  '/subscribe',
  '/billing-required',
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

// Public-facing pages that never need auth — skip the Clerk session
// lookup entirely so these routes aren't blocked by the auth round-trip.
const isFullyPublicRoute = createRouteMatcher([
  '/apply/(.*)',
  '/apply/b/(.*)',
  '/book/(.*)',
  '/status/(.*)',
  '/api/public/(.*)',
  '/api/webhooks/(.*)',
  '/api/mcp',
  '/api/mcp/oauth/token',
  '/api/tours/book',
  '/.well-known/(.*)',
]);

// Routes that should NEVER be passed as redirect_url after login.
// Only actual dashboard pages (/s/...) are valid post-login destinations.
const SAFE_REDIRECT_PREFIXES = ['/s/', '/broker', '/admin', '/authorize', '/invite/', '/subscribe', '/billing-required'];

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;

  // Fast-path: public-facing pages skip the Clerk auth() call entirely.
  // This avoids an external API round-trip that adds seconds to page load.
  // The x-public-page header tells the root layout to skip ClerkProvider
  // so Clerk's client-side JS doesn't prompt visitors to sign in.
  if (isFullyPublicRoute(request)) {
    const headers = new Headers(request.headers);
    headers.set('x-public-page', '1');
    return NextResponse.next({ request: { headers } });
  }

  const session = await auth();

  // `/` → send everyone to the right place immediately.
  if (pathname === '/') {
    if (session.userId) {
      return NextResponse.redirect(new URL('/auth/redirect?intent=realtor', request.url));
    }
    return NextResponse.redirect(new URL('/login/realtor', request.url));
  }

  // Authenticated users on auth pages → send to their dashboard.
  if (session.userId && (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname.startsWith('/login'))) {
    // Preserve intent from the page they're on (broker login → broker intent)
    const isBrokerPath = pathname.startsWith('/login/broker');
    const isBrokerIntent = request.nextUrl.searchParams.get('intent') === 'broker';
    const intent = isBrokerPath || isBrokerIntent ? 'broker' : 'realtor';
    return NextResponse.redirect(new URL(`/auth/redirect?intent=${intent}`, request.url));
  }

  // Block suspended (banned) users from accessing protected routes.
  // Clerk's banUser invalidates sessions, but this serves as a safety net
  // in case a session token is still valid during the propagation window.
  if (session.userId) {
    const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
    if (metadata.banned === true) {
      // Sign out banned users by redirecting to login with a message
      const bannedUrl = new URL('/login/realtor', request.url);
      bannedUrl.searchParams.set('reason', 'suspended');
      return NextResponse.redirect(bannedUrl);
    }
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

    // Admin route protection — lightweight check in middleware.
    // The layout performs the authoritative DB check via requireAdmin().
    // Here we only block users who are clearly NOT admins (no metadata claim).
    // Users with DB-only admin role (no Clerk metadata) are allowed through
    // so the layout can verify them against the database.
    if (isAdminRoute(request)) {
      // If user has Clerk metadata confirming non-admin, block early.
      // If metadata is missing/empty, let them through for DB check in layout.
      const metadata = (session.sessionClaims?.publicMetadata ?? {}) as Record<string, unknown>;
      const hasExplicitNonAdminRole = metadata.role !== undefined && metadata.role !== 'admin';
      if (hasExplicitNonAdminRole) {
        return NextResponse.redirect(new URL('/auth/redirect?intent=realtor', request.url));
      }
    }
  }

  // Pass the current pathname to layouts via request header (used by subscription gate)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
