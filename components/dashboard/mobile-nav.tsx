'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { mobileNavItems } from '@/lib/nav-items';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  UserCircle,
  Users,
  Briefcase,
  PhoneIncoming,
} from 'lucide-react';

const brokerMobileItems = [
  { href: '/broker', label: 'Team', icon: LayoutDashboard, exact: true },
  { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming, exact: false },
  { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
  { href: '/broker/members', label: 'Members', icon: Users, exact: false },
];

interface MobileNavProps {
  slug: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
}

// ─── Charcoal palette ─────────────────────────────────────────────────────────
//
// Chippi is a paper-flat, white-canvas product. This bar is a deliberate
// dark-chrome exception — the realtor asked for the floating Dribbble pill,
// tailored to charcoal grey, not the bright neutrals of the rest of the app.
// The swatches below match Chippi's dark-mode `--card` (#151517) and
// `--border` (#27272a) so the bar reads as the same family of dark surfaces
// already in the design language, not a foreign import.
const BAR_FILL = '#1a1a1c'; // charcoal — slightly lighter than dark `--card`
const BAR_STROKE = 'rgba(255,255,255,0.06)'; // hairline rim on the pill

// ─── Geometry ─────────────────────────────────────────────────────────────────
//
// The bar is 64px tall and the notch is a semicircle (radius 36) cut into the
// top center. The Chippi button is 60px diameter, sitting so its center is at
// the top edge of the bar — half pops above, half overlaps the notch. A 6px
// gap between the button rim and the notch rim shows the charcoal-on-dark
// halo that makes the cutout legible.
const BAR_HEIGHT = 64;
const NOTCH_RADIUS = 36;
const BAR_RADIUS = 28; // pill corner radius
const CHIPPI_SIZE = 60;

/**
 * Builds the SVG path for the bar: a rounded rectangle with a semicircular
 * notch cut into the top center. Width is passed at render time via a
 * preserveAspectRatio='none' viewBox so the same path scales to any device
 * width without recomputation.
 *
 * Path (clockwise from top-left, viewBox 100×64):
 *   M radius,0                       — top-left after corner
 *   H (50 - notchHalf)               — top edge up to notch
 *   A notch curve (semicircle down)  — into the notch
 *   H (100 - radius)                 — top edge after notch
 *   A topRightCorner                 — round corner
 *   V (64 - radius)                  — right edge
 *   A bottomRightCorner              — round corner
 *   H radius                         — bottom edge
 *   A bottomLeftCorner               — round corner
 *   V radius                         — left edge
 *   A topLeftCorner                  — round corner
 *   Z
 *
 * We use a viewBox of WIDTH×HEIGHT where WIDTH is the live pixel width so the
 * notch stays a true circle. Computed in the component with a ref or via CSS
 * — here we render at viewBox 360×64 and let preserveAspectRatio stretch
 * horizontally; the notch shape is preserved because we render the SVG with
 * an explicit width and the notch path is centered.
 */
function barPath(width: number): string {
  const w = width;
  const h = BAR_HEIGHT;
  const r = BAR_RADIUS;
  const nr = NOTCH_RADIUS;
  const cx = w / 2;
  return [
    `M ${r} 0`,
    `H ${cx - nr}`,
    // Semicircle that dips DOWN into the bar (carving the notch). Going
    // clockwise from (cx - nr, 0) to (cx + nr, 0): sweep-flag=1 picks the
    // arc that bows into +y (down, into the bar) — exactly the cutout. The
    // raised Chippi button sits over this curve.
    `A ${nr} ${nr} 0 0 1 ${cx + nr} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
}

// Pre-computed path at a nominal width — preserveAspectRatio='none' on the
// viewBox lets the bar stretch to any device width while keeping the notch
// centered. Nominal width 360 maps to a typical iPhone (~390px) cleanly.
const NOMINAL_WIDTH = 360;
const BAR_PATH = barPath(NOMINAL_WIDTH);

// ─── Side tab cell ────────────────────────────────────────────────────────────

function SideTab({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="relative flex-1 flex items-center justify-center h-full min-h-[44px] focus-visible:outline-none"
    >
      <span
        className={cn(
          'inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-150',
          isActive
            ? 'bg-white/[0.08] text-white'
            : 'text-white/70 hover:text-white',
        )}
      >
        <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
      </span>
    </Link>
  );
}

// ─── Center Chippi button ─────────────────────────────────────────────────────

function ChippiCenter({ href, isActive }: { href: string; isActive: boolean }) {
  return (
    <Link
      href={href}
      aria-label="Chippi"
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'absolute left-1/2 -translate-x-1/2 flex items-center justify-center rounded-full bg-[#1a1a1c]',
        // Half above the bar's top edge → raised focal element.
        // Top sits at -(CHIPPI_SIZE/2) from the bar top, so the button center
        // lands on the bar's top edge.
        'transition-transform duration-150 active:scale-[0.96] focus-visible:outline-none',
        // A 1px hairline ring at idle; on active, the rim brightens.
        isActive
          ? 'ring-2 ring-white/40'
          : 'ring-1 ring-white/10',
      )}
      style={{
        width: CHIPPI_SIZE,
        height: CHIPPI_SIZE,
        top: -(CHIPPI_SIZE / 2),
      }}
    >
      <img
        src="/chip-avatar.png"
        alt=""
        className="w-[52px] h-[52px] rounded-full object-cover"
      />
    </Link>
  );
}

// ─── Bar shell (charcoal pill + SVG notch) ────────────────────────────────────
//
// The container is the floating positioning layer. Inside, an inline SVG
// renders the bar shape (pill with top-center notch). On top of the SVG we
// lay a flex row of five cells. The middle cell is intentionally empty — the
// raised Chippi button is absolutely positioned over the notch by ChippiCenter.

function BarShell({
  children,
  chippi,
}: {
  children: React.ReactNode;
  chippi: React.ReactNode;
}) {
  return (
    <nav
      data-dashboard-mobile-nav
      // Floats above the iPhone home indicator; inset 12px from edges.
      className="md:hidden fixed left-3 right-3 z-50"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      aria-label="Primary"
    >
      <div className="relative" style={{ height: BAR_HEIGHT }}>
        {/* SVG bar — pill with top-center notch. Stretches to full width;
            preserveAspectRatio='none' lets the bar grow with the screen while
            the notch stays geometrically a half-circle on render. */}
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${NOMINAL_WIDTH} ${BAR_HEIGHT}`}
          preserveAspectRatio="none"
          // The shadow is intentionally faint — paper-flat is the rule; the
          // bar's elevation comes from the raised Chippi center, not from
          // shadow ceremony.
          style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.18))' }}
        >
          <path d={BAR_PATH} fill={BAR_FILL} stroke={BAR_STROKE} strokeWidth="1" />
        </svg>
        {/* Tap layer — five cells in a row. The middle cell is a spacer with
            the same flex weight so the four side icons stay perfectly spaced
            around the (visually empty) notch. */}
        <div className="relative h-full flex items-stretch">
          {children}
        </div>
        {/* Raised Chippi button — absolutely positioned, sits in the notch.
            Rendered last so it's above the SVG and tap layer. */}
        {chippi}
      </div>
    </nav>
  );
}

// ─── Broker variant ───────────────────────────────────────────────────────────
//
// The broker mobile nav stays as the flat row it was — brokers don't have
// Chippi at the bottom of every page, so the notched pill doesn't earn its
// place here. Same charcoal floating pill, just without the notch.

function BrokerMobileNav({ pathname, slug, isBrokerOnly }: { pathname: string; slug: string; isBrokerOnly: boolean }) {
  const base = `/s/${slug}`;
  return (
    <nav
      data-dashboard-mobile-nav
      className="md:hidden fixed left-3 right-3 z-50"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      aria-label="Brokerage"
    >
      <div
        className="rounded-full bg-[#1a1a1c] ring-1 ring-white/[0.06] flex items-stretch"
        style={{ height: BAR_HEIGHT, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}
      >
        {!isBrokerOnly && slug && (
          <Link
            href={base}
            aria-label="Workspace"
            className="flex-1 flex items-center justify-center min-h-[44px] text-white/70 hover:text-white"
          >
            <Briefcase size={22} strokeWidth={1.75} />
          </Link>
        )}
        {brokerMobileItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex-1 flex items-center justify-center min-h-[44px] focus-visible:outline-none"
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-150',
                  isActive ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:text-white',
                )}
              >
                <item.icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MobileNav({ slug, isBroker = false, isBrokerOnly = false }: MobileNavProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;

  // Chippi workspace owns its own bottom area (sticky composer). The bar
  // would collide; hide it the same way the previous implementation did.
  if (pathname?.startsWith(`${base}/chippi`)) return null;

  const isOnBrokerPage = pathname.startsWith('/broker');
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return <BrokerMobileNav pathname={pathname} slug={slug} isBrokerOnly={isBrokerOnly} />;
  }

  // The realtor mobile bar. Source of truth for the items is `mobileNavItems`
  // in `lib/nav-items.ts`. The data order there is Chippi · People · Deals ·
  // Calendar · Settings; the VISUAL order here is People · Deals · Chippi ·
  // Calendar · Settings — Chippi is the focal raised center button, the four
  // others flank it. We map from the typed data array (so labels/icons stay
  // in lockstep with the sidebar) into the visual order.
  const byHref = Object.fromEntries(
    mobileNavItems.map((item) => [item.href, item]),
  );
  const chippiItem = byHref['/chippi'];
  const sideOrder = ['/contacts', '/deals', '/calendar', '/settings'] as const;
  const sideItems = sideOrder.map((href) => byHref[href]).filter(Boolean);

  // Active-state matcher matches the previous behavior: prefix-match the
  // route under the workspace base.
  const isActive = (href: string) => pathname.startsWith(`${base}${href}`);

  return (
    <BarShell
      chippi={
        chippiItem && (
          <ChippiCenter
            href={`${base}${chippiItem.href}`}
            isActive={isActive(chippiItem.href)}
          />
        )
      }
    >
      {/* Left two */}
      {sideItems.slice(0, 2).map((item) => (
        <SideTab
          key={item.href}
          href={`${base}${item.href}`}
          label={item.label}
          icon={item.icon}
          isActive={isActive(item.href)}
        />
      ))}
      {/* Center spacer — keeps the four side cells spaced around the notch.
          flex-1 matches the side cells so the geometry is perfectly even. */}
      <div className="flex-1" aria-hidden />
      {/* Right two */}
      {sideItems.slice(2).map((item) => (
        <SideTab
          key={item.href}
          href={`${base}${item.href}`}
          label={item.label}
          icon={item.icon}
          isActive={isActive(item.href)}
        />
      ))}
      {/* Broker quick-link is intentionally dropped from the realtor bar —
          the bar is five slots, four side + center Chippi. The broker
          shortcut is reachable from the in-app workspace switcher. */}
    </BarShell>
  );
}
