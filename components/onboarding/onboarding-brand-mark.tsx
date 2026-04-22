'use client';

/**
 * Small stylised brand mark for the onboarding hero. Renders as an inline
 * SVG with an orange gradient fill so it feels on-brand without shipping a
 * separate asset. Shape is a simple rounded-diamond glyph — reads well on a
 * light background.
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
          <stop offset="50%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#C2410C" />
        </linearGradient>
      </defs>
      {/* Soft drop shadow — gives the mark a little depth on white */}
      <ellipse cx="28" cy="50" rx="12" ry="2" fill="#C2410C" opacity="0.18" />
      {/* Main rounded-diamond mark */}
      <path
        d="M28 6 L46 18 V38 L28 50 L10 38 V18 Z"
        fill="url(#chippi-brand-grad)"
      />
      {/* Inner highlight — slight specular so it doesn't look flat */}
      <path
        d="M28 16 L38 22 V34 L28 40 L18 34 V22 Z"
        fill="rgba(255, 255, 255, 0.22)"
      />
    </svg>
  );
}
