'use client';

/**
 * Small stylised brand mark for the onboarding hero. Uses an inline SVG with
 * an orange gradient so it feels on-brand without shipping a separate asset.
 * The shape is deliberately abstract (a rounded "C"-ish glyph) so it reads
 * as a brand element, not a literal icon from the icon set.
 */
export function OnboardingBrandMark({ size = 56 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="chippi-brand-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFB056" />
          <stop offset="50%" stopColor="#FF7A3A" />
          <stop offset="100%" stopColor="#E64A1A" />
        </linearGradient>
        <filter id="chippi-brand-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      {/* Soft outer glow */}
      <circle cx="28" cy="28" r="22" fill="url(#chippi-brand-grad)" opacity="0.15" filter="url(#chippi-brand-blur)" />
      {/* Main mark — a rounded "chip" / house glyph */}
      <path
        d="M28 8 L44 18 V38 L28 48 L12 38 V18 Z"
        fill="url(#chippi-brand-grad)"
        stroke="url(#chippi-brand-grad)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Inner accent — subtle window to give depth */}
      <path
        d="M28 18 L38 24 V36 L28 42 L18 36 V24 Z"
        fill="rgba(255, 255, 255, 0.18)"
      />
    </svg>
  );
}
