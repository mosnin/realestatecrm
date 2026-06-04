'use client';

/**
 * Client wrapper for the 3D interactive navbar.
 *
 * The navbar renders a raw <Canvas> from @react-three/fiber, which reaches
 * for browser APIs at module/render time and crashes during SSR. Next 15
 * forbids `ssr: false` on a next/dynamic call inside a Server Component, so
 * we isolate the client-only dynamic import here and let the (server)
 * marketing layout render this thin wrapper instead.
 *
 * The loading fallback is a plain black bar of the same height (h-20) as the
 * real navbar, so there's no layout shift before hydration.
 */

import dynamic from 'next/dynamic';

const Navbar = dynamic(
  () => import('@/components/ui/3d-interactive-navbar').then((m) => m.Navbar),
  {
    ssr: false,
    loading: () => (
      <div className="sticky top-0 z-50 h-20 w-full border-b border-white/10 bg-black" />
    ),
  },
);

export function MarketingNavbar() {
  return <Navbar />;
}
